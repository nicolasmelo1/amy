import { ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
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
    primary?: { resetsAt?: number | null };
    secondary?: { resetsAt?: number | null };
  };
}
export interface CodexAppServer {
  run(input: {
    prompt: string;
    cwd: string;
    model?: string;
    readOnly: boolean;
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
            timeoutMs: options.timeoutMs ?? 30 * 60 * 1000,
            command: options.command ?? "codex",
            ...options,
          };
    this.options.runner ??= new NodeCommandRunner();
  }

  async run(input: {
    prompt: string;
    cwd: string;
    model?: string;
    readOnly: boolean;
  }): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }> {
    // A fresh home is the app-server equivalent of exec's ephemeral, disabled
    // user configuration: no AGENTS.md, skills, hooks, plugins, apps, memories
    // or persisted session can enter from the operator's CODEX_HOME.
    const home = isolatedHome(this.options);
    let child: ChildProcessWithoutNullStreams | undefined;
    let stderr = "";
    try {
      if (!this.options.runner?.spawn) {
        throw new Error(
          "codex app-server requires a command runner with managed spawn support",
        );
      }
      child = this.options.runner.spawn(
        this.options.command,
        [...(this.options.args ?? []), "app-server"],
        {
          cwd: input.cwd,
          env: { ...process.env, ...this.options.env, CODEX_HOME: home },
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
        if (!threadId)
          throw new Error("codex app-server did not return a thread id");
        await session.request("turn/start", {
          threadId,
          input: [{ type: "text", text: input.prompt }],
        });
        const turn = await session.turn;
        return {
          turn: session.usage ? { ...turn, usage: session.usage } : turn,
          limits: await readLimits(session, turn),
        };
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
  } catch {
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
          new Error(
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

function failedTurn(error: unknown, stderr = ""): CodexTurn {
  return {
    status: "failed",
    items: [],
    error: { message: `${error}${stderr ? `\n${stderr}` : ""}` },
  };
}

export class CodexHarness implements Harness {
  readonly name = "codex";
  private readonly app: CodexAppServer;
  constructor(
    _runner: CommandRunner,
    private readonly config: CodexHarnessConfig = {},
    app?: CodexAppServer,
  ) {
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
  return turn.status === "completed" && Boolean(messageOfTurn(turn))
    ? "completed"
    : "failed";
}
