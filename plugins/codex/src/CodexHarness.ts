import { ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AgentOutcome,
  AskContext,
  CommandRunner,
  Harness,
  HarnessReply,
  NodeCommandRunner,
  TokenUsage,
} from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";

export interface CodexHarnessConfig {
  model?: string;
  timeoutMs?: number;
}
export interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  outputTokens?: number;
}
export interface CodexTurn {
  status: string;
  items: readonly { type?: string; text?: string }[];
  error?: { message: string; codexErrorInfo?: unknown } | null;
  usage?: CodexUsage | null;
  durationMs?: number | null;
}
export interface CodexRateLimits {
  rateLimits?: {
    primary?: {
      usedPercent?: number | null;
      windowDurationMins?: number | null;
      resetsAt?: number | null;
    } | null;
    secondary?: {
      usedPercent?: number | null;
      windowDurationMins?: number | null;
      resetsAt?: number | null;
    } | null;
  };
}
export interface CodexAppServer {
  run(input: {
    prompt: string;
    cwd: string;
    model?: string;
    readOnly: boolean;
    /** The skill the prompt is addressed to, when the relay lent one. */
    skill?: { readonly name: string; readonly path: string };
  }): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }>;
}
export interface CodexAppServerOptions {
  timeoutMs?: number;
  command?: string;
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  shutdownGraceMs?: number;
  runner?: CommandRunner;
}

type Pending = { resolve(value: unknown): void; reject(reason: Error): void };
type RpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
  method?: string;
  params?: { turn?: CodexTurn; item?: { type?: string; text?: string } };
};

/** Runs one isolated `codex app-server` JSON-RPC child over stdio. */
export class StdioCodexAppServer implements CodexAppServer {
  private readonly options: Required<
    Pick<CodexAppServerOptions, "timeoutMs" | "command">
  > &
    CodexAppServerOptions;

  constructor(options: number | CodexAppServerOptions = {}) {
    this.options =
      typeof options === "number"
        ? { timeoutMs: options, command: "codex" }
        : {
            ...options,
            timeoutMs: options.timeoutMs ?? 30 * 60 * 1000,
            command: options.command ?? "codex",
          };
    this.options.runner ??= new NodeCommandRunner();
  }

  async run(input: {
    prompt: string;
    cwd: string;
    model?: string;
    readOnly: boolean;
    skill?: { readonly name: string; readonly path: string };
  }): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }> {
    // A skill codex could not load is refused before the app-server starts:
    // sending the turn anyway would look like work and prove nothing.
    const refused = refusedSkill(input.skill);
    if (refused) return refused;
    // A fresh home is the app-server equivalent of exec's ephemeral, disabled
    // user configuration: no AGENTS.md, skills, hooks, plugins, apps, memories
    // or persisted session can enter from the operator's CODEX_HOME.
    const home = isolatedHome(this.options);
    // The one skill the turn is addressed to, and nothing else of the
    // operator's: the fresh HOME has no user root, and this link is the only
    // skill codex can discover. The turn also names it explicitly below.
    if (input.skill) lendSkill(home, input.skill);
    let stderr = "";
    try {
      const session = this.sessionFor(input, home);
      try {
        return await exchange(session, input);
      } catch (error) {
        stderr = session.stderr;
        return { turn: failedTurn(error, stderr) };
      } finally {
        await session.close();
      }
    } catch (error) {
      return { turn: failedTurn(error, stderr) };
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }

  /** The child and its session, or the error that says why there is none. */
  private sessionFor(
    input: { cwd: string },
    home: string,
  ): RpcSession {
    if (!this.options.runner?.spawn) {
      throw new Error(
        "codex app-server requires a command runner with managed spawn support",
      );
    }
    const child = this.options.runner.spawn(
      this.options.command,
      [...(this.options.args ?? []), "app-server"],
      {
        cwd: input.cwd,
        // HOME is the fresh home too: codex 0.166 scans `$HOME/.agents/skills`
        // as a user root, and leaving the operator's HOME in place would let
        // their own skills into a run that is meant to see one.
        env: { ...process.env, ...this.options.env, CODEX_HOME: home, HOME: home },
      },
    );
    return new RpcSession(
      child,
      this.options.timeoutMs,
      this.options.shutdownGraceMs ?? 250,
    );
  }

  /** Reads account limits only; it never starts a thread or a turn. */
  async readRateLimits(): Promise<CodexRateLimits> {
    const home = isolatedHome(this.options);
    try {
      if (!this.options.runner?.spawn) {
        throw new Error(
          "codex app-server requires a command runner with managed spawn support",
        );
      }
      const child = this.options.runner.spawn(
        this.options.command,
        [...(this.options.args ?? []), "app-server"],
        {
          cwd: process.cwd(),
          env: { ...process.env, ...this.options.env, CODEX_HOME: home, HOME: home },
        },
      );
      const session = new RpcSession(
        child,
        this.options.timeoutMs,
        this.options.shutdownGraceMs ?? 250,
      );
      try {
        await session.request("initialize", {
          clientInfo: { name: "amy", version: "0" },
          capabilities: {},
        });
        return (await session.request(
          "account/rateLimits/read",
          {},
        )) as CodexRateLimits;
      } finally {
        await session.close();
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
}

function isolatedHome(options: CodexAppServerOptions): string {
  const home = mkdtempSync(path.join(os.tmpdir(), "amy-codex-home-"));
  const configuredHome =
    options.env?.CODEX_HOME ??
    process.env.CODEX_HOME ??
    path.join(os.homedir(), ".codex");
  const auth = path.join(configuredHome, "auth.json");
  // Authentication is a credential, not user configuration. Copy only it:
  // copying the home would reintroduce instructions, skills and hooks.
  if (existsSync(auth)) copyFileSync(auth, path.join(home, "auth.json"));
  return home;
}

/**
 * Where codex's own skills are, as codex 0.166 reads them.
 *
 * The CLI scans two user roots: `$CODEX_HOME/skills`, which its own source
 * marks deprecated and keeps for compatibility, and `$HOME/.agents/skills`,
 * which its documentation names. The newer root wins when it is there, so an
 * install that has moved is followed; otherwise the old one is still where
 * the operator's skills are.
 */
export function skillRoot(home: string, codexHome: string): string {
  const agents = path.join(home, ".agents", "skills");
  return existsSync(agents) ? agents : path.join(codexHome, "skills");
}

/**
 * Links the validated skill under the fresh home's `skills`.
 *
 * Codex 0.166 reads `$CODEX_HOME/skills` and `$HOME/.agents/skills`; the run's
 * HOME and CODEX_HOME are both this fresh home, so this link is the only skill
 * the run can discover beside the explicit `turn/start` input.
 */
function lendSkill(home: string, skill: { name: string; path: string }): void {
  const skills = path.join(home, "skills");
  mkdirSync(skills, { recursive: true });
  symlinkSync(path.resolve(skill.path), path.join(skills, skill.name), "dir");
}

/**
 * Why codex would not load the lent skill, or undefined when it will.
 *
 * Codex 0.166 refuses a SKILL.md with no YAML frontmatter, so a directory
 * without one is not a skill it can be asked for. The turn is refused before
 * it starts rather than run without the skill it is addressed to.
 */
function skillProblem(skill: { name: string; path: string }): string | undefined {
  const file = path.join(path.resolve(skill.path), "SKILL.md");
  if (!existsSync(file)) {
    return `/${skill.name} cannot be lent to codex: ${file} does not exist, so the turn would run without the skill`;
  }
  const body = readFileSync(file, "utf8");
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(body)) {
    return `/${skill.name} cannot be lent to codex: ${file} has no YAML frontmatter delimited by ---, which codex 0.166 refuses`;
  }
  return undefined;
}

/**
 * What `turn/start` carries.
 *
 * A skill is an explicit input item with the path of its SKILL.md, which is how
 * codex 0.166's `UserInput` names one; a leading `/name` is not a skill mention
 * to codex, so it is removed from the text rather than sent as prose.
 */
function turnInput(
  prompt: string,
  skill?: { readonly name: string; readonly path: string },
): readonly { type: string; text?: string; name?: string; path?: string }[] {
  if (!skill) return [{ type: "text", text: prompt }];
  const addressed = `/${skill.name}`;
  const body = prompt.startsWith(addressed) ? prompt.slice(addressed.length).replace(/^\s+/, "") : prompt;
  return [
    { type: "skill", name: skill.name, path: path.join(path.resolve(skill.path), "SKILL.md") },
    { type: "text", text: body },
  ];
}

/** A turn addressed to a skill codex could not load, or undefined when it could. */
function refusedSkill(skill: { readonly name: string; readonly path: string } | undefined): { turn: CodexTurn } | undefined {
  if (!skill) return undefined;
  const problem = skillProblem(skill);
  return problem ? { turn: failedTurn(new Error(problem)) } : undefined;
}

/** The protocol conversation a run is: initialize, thread, turn, completion. */
async function exchange(
  session: RpcSession,
  input: {
    prompt: string;
    cwd: string;
    model?: string;
    readOnly: boolean;
    skill?: { readonly name: string; readonly path: string };
  },
): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }> {
  await session.request("initialize", {
    clientInfo: { name: "amy", version: "0" },
    capabilities: {},
  });
  const started = (await session.request("thread/start", {
    cwd: input.cwd,
    model: input.model ?? null,
    sandbox: input.readOnly ? "read-only" : "workspace-write",
    ephemeral: true,
    config: {
      features: {
        hooks: false,
        plugins: false,
        apps: false,
        memories: false,
      },
    },
    approvalPolicy: "never",
  })) as { thread?: { id?: string } };
  const threadId = started.thread?.id;
  if (!threadId) throw new Error("codex app-server did not return a thread id");
  await session.request("turn/start", {
    threadId,
    input: turnInput(input.prompt, input.skill),
  });
  const turn = await session.turn;
  return {
    turn: session.usage ? { ...turn, usage: session.usage } : turn,
    limits: await readLimits(session, turn),
  };
}

async function readLimits(
  session: RpcSession,
  turn: CodexTurn,
): Promise<CodexRateLimits | undefined> {
  if (!isLimited(turn.error?.codexErrorInfo)) return undefined;
  // Reset lookup is auxiliary: its failure cannot erase a structured limit.
  try {
    return (await session.request(
      "account/rateLimits/read",
      {},
    )) as CodexRateLimits;
  } catch (error) {
    // A handbrake can arrive while this auxiliary request is in flight.  The
    // lookup is optional, but cancellation is terminal for this run.
    if (error instanceof CodexRunAbandoned) throw error;
    return undefined;
  }
}

class RpcSession {
  private readonly pending = new Map<number, Pending>();
  private readonly timer: NodeJS.Timeout;
  private sequence = 0;
  private buffer = "";
  private closed = false;
  private didClose = false;
  private finishTurn!: (turn: CodexTurn) => void;
  private failTurn!: (error: Error) => void;
  private streamedText = "";
  readonly turn: Promise<CodexTurn>;
  usage: CodexUsage | undefined;
  stderr = "";

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
    private readonly shutdownGraceMs: number,
  ) {
    this.turn = new Promise<CodexTurn>((resolve, reject) => {
      this.finishTurn = resolve;
      this.failTurn = reject;
    });
    // Initialization can fail before anyone awaits the completion notification.
    // Mark that branch observed while the request path carries the same error.
    void this.turn.catch(() => undefined);
    this.timer = setTimeout(
      () =>
        this.fail(new Error(`codex app-server timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.read(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    child.on("error", (error) => this.fail(error));
    child.stdin.on("error", (error) => this.fail(error));
    child.on("exit", (code, signal) => {
      if (!this.closed)
        this.fail(
          signal === "SIGTERM"
            ? new CodexRunAbandoned("codex app-server was stopped")
            : new Error(
            `codex app-server exited before completion (${signal ?? code ?? "unknown"})`,
              ),
        );
    });
    child.on("close", () => {
      this.didClose = true;
    });
  }

  request(method: string, params: object): Promise<unknown> {
    if (this.closed)
      return Promise.reject(new Error("codex app-server is closed"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        (error) => {
          if (error) this.fail(error);
        },
      );
    });
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.readLine(line);
  }

  private readLine(line: string): void {
    try {
      const message = JSON.parse(line) as RpcMessage;
      this.acceptResponse(message);
      this.acceptNotification(message);
    } catch {
      /* non-protocol stdout cannot block a run */
    }
  }

  private acceptResponse(message: RpcMessage): void {
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(
        new Error(message.error.message ?? "codex app-server JSON-RPC error"),
      );
    } else pending.resolve(message.result);
  }

  private acceptNotification(message: RpcMessage): void {
    if (message.method === "thread/tokenUsage/updated")
      this.usage = tokenUsageOf(message.params);
    if (message.method === "item/completed") {
      const item = message.params?.item;
      if (isAgentMessage(item) && item.text) this.streamedText += item.text;
    }
    if (message.method === "turn/completed" && message.params?.turn) {
      this.finishTurn(this.completedTurn(message.params.turn));
    }
  }

  private completedTurn(turn: CodexTurn): CodexTurn {
    if (messageOfTurn(turn) || !this.streamedText) return turn;
    return {
      ...turn,
      items: [{ type: "agentMessage", text: this.streamedText }],
    };
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.failTurn(error);
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      clearTimeout(this.timer);
    }
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    if (
      this.didClose ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null
    )
      return;
    const closed = new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill("SIGKILL");
        }
      }, this.shutdownGraceMs);
      this.child.once("close", () => {
        clearTimeout(force);
        resolve();
      });
    });
    if (this.child.exitCode === null && this.child.signalCode === null)
      this.child.kill("SIGTERM");
    await closed;
  }
}

/** The app-server streams the authoritative thread total separately from Turn. */
function tokenUsageOf(params: unknown): CodexUsage | undefined {
  if (!params || typeof params !== "object") return undefined;
  const tokenUsage = (params as { tokenUsage?: unknown }).tokenUsage;
  if (!tokenUsage || typeof tokenUsage !== "object") return undefined;
  const total = (tokenUsage as { total?: unknown }).total;
  return total && typeof total === "object" ? (total as CodexUsage) : undefined;
}

class CodexRunAbandoned extends Error {}

function failedTurn(error: unknown, stderr = ""): CodexTurn {
  return {
    status: error instanceof CodexRunAbandoned ? "abandoned" : "failed",
    items: [],
    error: { message: `${error}${stderr ? `\n${stderr}` : ""}` },
  };
}

export class CodexHarness implements Harness {
  readonly name = "codex";
  /** It is handed a skill by place: a link in the fresh home the run gets. */
  readonly lendsSkill = true;
  /** The operator's own skills, where the codex CLI reads its user roots. */
  readonly skillsDirectory: string;
  private readonly app: CodexAppServer;
  constructor(
    _runner: CommandRunner,
    private readonly config: CodexHarnessConfig = {},
    app?: CodexAppServer,
  ) {
    this.skillsDirectory = skillRoot(os.homedir(), process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
    this.app =
      app ??
      new StdioCodexAppServer({ timeoutMs: config.timeoutMs, runner: _runner });
  }
  async ask(
    prompt: string,
    cwd: string,
    context: AskContext = {},
  ): Promise<HarnessReply> {
    const started = Date.now();
    const result = await this.app.run({
      prompt,
      cwd,
      model: this.config.model,
      readOnly: Boolean(context.readOnly),
      ...(context.skill ? { skill: context.skill } : {}),
    });
    const text = messageOfTurn(result.turn);
    const outcome = classify(result.turn);
    const tokens = tokensOfTurn(result.turn);
    const model = this.config.model ?? "";
    const spec = tokens && specFor(model);
    const reset =
      outcome === "rate-limited" ? resetAt(result.limits) : undefined;
    return {
      text,
      run: {
        outcome,
        harness: this.name,
        model,
        tokens,
        ...(spec
          ? { costUsd: costOf(spec, tokens), costSource: "computed" as const }
          : { costSource: "unknown" as const }),
        durationMs: result.turn.durationMs ?? Date.now() - started,
        output: [text, result.turn.error?.message].filter(Boolean).join("\n"),
        ...(reset === undefined
          ? {}
          : { retryAfterMs: Math.max(0, reset - Date.now()) }),
      },
    };
  }
}

export function tokensOfTurn(turn: CodexTurn): TokenUsage | undefined {
  const usage = turn.usage;
  if (!usage) return undefined;
  const cached = usage.cached_input_tokens ?? usage.cachedInputTokens ?? 0;
  const total = usage.input_tokens ?? usage.inputTokens ?? 0;
  return {
    input: Math.max(total - cached, 0),
    output: usage.output_tokens ?? usage.outputTokens ?? 0,
    cacheRead: cached,
    cacheWrite:
      usage.cache_write_input_tokens ?? usage.cacheWriteInputTokens ?? 0,
  };
}
export function messageOfTurn(turn: CodexTurn): string {
  return (
    turn.items
      .filter(
        (item) => item.type === "agentMessage" || item.type === "agent_message",
      )
      .map((item) => item.text ?? "")
      .at(-1) ?? ""
  );
}

function isAgentMessage(
  item: { type?: string; text?: string } | undefined,
): item is { type: string; text?: string } {
  return Boolean(
    item && (item.type === "agentMessage" || item.type === "agent_message"),
  );
}
export function isLimited(error: unknown): boolean {
  return error === "usageLimitExceeded" || error === "rateLimitExceeded";
}
export function resetAt(
  limits: CodexRateLimits | undefined,
): number | undefined {
  const resets = [
    limits?.rateLimits?.primary?.resetsAt,
    limits?.rateLimits?.secondary?.resetsAt,
  ].filter((at): at is number => typeof at === "number");
  return resets.length ? Math.min(...resets) * 1000 : undefined;
}
export function classify(turn: CodexTurn): AgentOutcome {
  if (isLimited(turn.error?.codexErrorInfo)) return "rate-limited";
  if (turn.status === "abandoned") return "abandoned";
  return turn.status === "completed" && Boolean(messageOfTurn(turn))
    ? "completed"
    : "failed";
}
