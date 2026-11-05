import { spawn } from "node:child_process";
import { AgentOutcome, AskContext, CommandRunner, Harness, HarnessReply } from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";

export interface CodexHarnessConfig { model?: string; timeoutMs?: number; }

export interface CodexTurn {
  status: string;
  items: readonly { type?: string; text?: string }[];
  error?: { message: string; codexErrorInfo?: unknown } | null;
  durationMs?: number | null;
}
export interface CodexRateLimits { rateLimits?: { primary?: { resetsAt?: number | null }; secondary?: { resetsAt?: number | null } }; }
export interface CodexAppServer {
  run(input: { prompt: string; cwd: string; model?: string; readOnly: boolean }): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }>;
}

/** Runs a short-lived `codex app-server` JSON-RPC child over stdio. */
export class StdioCodexAppServer implements CodexAppServer {
  constructor(private readonly timeoutMs = 30 * 60 * 1000) {}

  async run(input: { prompt: string; cwd: string; model?: string; readOnly: boolean }): Promise<{ turn: CodexTurn; limits?: CodexRateLimits }> {
    const child = spawn("codex", ["app-server"], { cwd: input.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let id = 0;
    const pending = new Map<number, (value: unknown) => void>();
    let completed: ((value: CodexTurn) => void) | undefined;
    let stderr = "";
    let buffer = "";
    const request = (method: string, params: object): Promise<unknown> => new Promise((resolve) => {
      const requestId = ++id;
      pending.set(requestId, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    });
    const turn = new Promise<CodexTurn>((resolve) => { completed = resolve; });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as { id?: number; result?: unknown; method?: string; params?: { turn?: CodexTurn } };
          if (typeof message.id === "number") pending.get(message.id)?.(message.result);
          if (message.method === "turn/completed" && message.params?.turn) completed?.(message.params.turn);
        } catch { /* protocol lines only */ }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); completed?.({ status: "failed", items: [], error: { message: `codex app-server timed out after ${this.timeoutMs}ms` } }); }, this.timeoutMs);
    try {
      await request("initialize", { clientInfo: { name: "amy", version: "0" }, capabilities: {} });
      const started = await request("thread/start", { cwd: input.cwd, model: input.model ?? null, sandbox: input.readOnly ? "read-only" : "workspace-write", ephemeral: true }) as { thread?: { id?: string } };
      const threadId = started.thread?.id;
      if (!threadId) throw new Error("codex app-server did not return a thread id");
      await request("turn/start", { threadId, input: [{ type: "text", text: input.prompt }] });
      const done = await turn;
      const limited = isLimited(done.error?.codexErrorInfo);
      const limits = limited ? await request("account/rateLimits/read", {}) as CodexRateLimits : undefined;
      return { turn: done, limits };
    } catch (error) {
      return { turn: { status: "failed", items: [], error: { message: `${error}${stderr ? `\n${stderr}` : ""}` } } };
    } finally { clearTimeout(timer); child.kill(); }
  }
}

export class CodexHarness implements Harness {
  readonly name = "codex";
  private readonly app: CodexAppServer;
  constructor(_runner: CommandRunner, private readonly config: CodexHarnessConfig = {}, app?: CodexAppServer) {
    this.app = app ?? new StdioCodexAppServer(config.timeoutMs);
  }
  async ask(prompt: string, cwd: string, context: AskContext = {}): Promise<HarnessReply> {
    const started = Date.now();
    const result = await this.app.run({ prompt, cwd, model: this.config.model, readOnly: Boolean(context.readOnly) });
    const text = messageOfTurn(result.turn);
    const outcome = classify(result.turn);
    const tokens = undefined;
    const model = this.config.model ?? "";
    const spec = tokens && specFor(model);
    const reset = outcome === "rate-limited" ? resetAt(result.limits) : undefined;
    return { text, run: { outcome, harness: this.name, model, tokens, ...(spec ? { costUsd: costOf(spec, tokens), costSource: "computed" as const } : { costSource: "unknown" as const }), durationMs: result.turn.durationMs ?? Date.now() - started, output: [text, result.turn.error?.message].filter(Boolean).join("\n"), ...(reset === undefined ? {} : { retryAfterMs: Math.max(0, reset - Date.now()) }) } };
  }
}

export function messageOfTurn(turn: CodexTurn): string { return turn.items.filter((item) => item.type === "agentMessage" || item.type === "agent_message").map((item) => item.text ?? "").at(-1) ?? ""; }
export function isLimited(error: unknown): boolean { return error === "usageLimitExceeded" || error === "rateLimitExceeded"; }
export function resetAt(limits: CodexRateLimits | undefined): number | undefined {
  const resets = [limits?.rateLimits?.primary?.resetsAt, limits?.rateLimits?.secondary?.resetsAt].filter((at): at is number => typeof at === "number");
  return resets.length ? Math.min(...resets) * 1000 : undefined;
}
export function classify(turn: CodexTurn): AgentOutcome { if (isLimited(turn.error?.codexErrorInfo)) return "rate-limited"; return turn.status === "completed" && Boolean(messageOfTurn(turn)) ? "completed" : "failed"; }
