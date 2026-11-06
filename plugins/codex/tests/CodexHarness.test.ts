import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeCommandRunner } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import {
  CodexAppServer,
  CodexHarness,
  CodexTurn,
  StdioCodexAppServer,
  classify,
  isLimited,
  resetAt,
  tokensOfTurn,
} from "../src/index.js";

const completed: CodexTurn = {
  status: "completed",
  items: [{ type: "agentMessage", text: "done" }],
  usage: {
    input_tokens: 17_571,
    cached_input_tokens: 11_008,
    cache_write_input_tokens: 0,
    output_tokens: 5,
  },
};
const fixture = path.join(
  import.meta.dirname,
  "fixtures",
  "codex-0.166.0-app-server.json",
);

function harnessFor(result: Awaited<ReturnType<CodexAppServer["run"]>>) {
  const app: CodexAppServer = { run: async () => result };
  return new CodexHarness(new ScriptedRunner(), { model: "gpt-5" }, app);
}

function fakeServer(
  mode: string,
  env: NodeJS.ProcessEnv = {},
  runner = new NodeCommandRunner(),
): StdioCodexAppServer {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-codex-server-"));
  const script = path.join(root, "server.cjs");
  fs.writeFileSync(
    script,
    `
const fs = require("node:fs");
let requests = [];
const reply = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result})+"\\n");
const send = value => { const line = Buffer.from(JSON.stringify(value)+"\\n"); const marker = Buffer.from("é"); const at = line.indexOf(marker); if (${JSON.stringify(mode)} === "split-utf8" && at >= 0) { process.stdout.write(line.subarray(0, at + 1)); setTimeout(() => process.stdout.write(line.subarray(at + 1)), 2); } else process.stdout.write(line); };
const complete = (limited = false) => { send({jsonrpc:"2.0",method:"thread/tokenUsage/updated",params:{threadId:"thread-1",turnId:"turn-1",tokenUsage:{total:{input_tokens:17571,cached_input_tokens:11008,output_tokens:5},last:{input_tokens:2,cached_input_tokens:1,output_tokens:1}}}}); if (${JSON.stringify(mode)} === "streamed-limit") send({jsonrpc:"2.0",method:"item/completed",params:{item:{type:"agentMessage",text:"half-done é"}}}); send({jsonrpc:"2.0",method:"turn/completed",params:{turn:{status:limited?"failed":"completed",items:${JSON.stringify(mode)} === "streamed-limit"?[]:[{type:"agentMessage",text:${JSON.stringify(mode)} === "split-utf8"?"café":(fs.existsSync(process.env.CODEX_HOME + "/config.toml") ? "contaminated" : (fs.existsSync(process.env.CODEX_HOME + "/auth.json") ? "authenticated" : "unauthenticated"))}],error: limited ? {message:"limited",codexErrorInfo:"usageLimitExceeded"} : null}}}); };
if (${JSON.stringify(mode)} === "ignore-term") process.on("SIGTERM", () => {});
if (${JSON.stringify(mode)} === "split-stderr") { const bytes=Buffer.from("café"); process.stderr.write(bytes.subarray(0,4)); setTimeout(() => process.stderr.write(bytes.subarray(4)), 2); }
process.stdin.on("data", chunk => { for (const line of String(chunk).trim().split("\\n")) { if (!line) continue; const r=JSON.parse(line); requests.push(r); if (["initialize-timeout","ignore-term","cancellable","split-stderr"].includes(${JSON.stringify(mode)})) continue; if (${JSON.stringify(mode)} === "premature-exit") process.exit(9); if (r.method === "initialize") reply(r.id, {}); else if (r.method === "thread/start") { const f=r.params.config?.features; if (${JSON.stringify(mode)} === "protocol-config" && !(r.params.approvalPolicy === "never" && f?.hooks === false && f?.plugins === false && f?.apps === false && f?.memories === false)) reply(r.id, {thread:{}}); else reply(r.id, {thread:{id:"thread-1"}}); } else if (r.method === "turn/start") { reply(r.id, {}); complete(${JSON.stringify(mode)} === "rate-exit" || ${JSON.stringify(mode)} === "streamed-limit"); } else if (r.method === "account/rateLimits/read") { if (${JSON.stringify(mode)} === "rate-exit") process.exit(8); else reply(r.id, {rateLimits:{primary:{resetsAt:1800000000}}}); } } });
`,
  );
  return new StdioCodexAppServer({
    timeoutMs: ["normal", "split-utf8", "split-stderr", "streamed-limit", "protocol-config"].includes(mode) ? 500 : (mode === "cancellable" ? 5_000 : 40),
    command: process.execPath,
    args: [script],
    env,
    runner,
    shutdownGraceMs: 30,
  });
}

describe("the app-server harness", () => {
  it("preserves app-server usage, computed pricing and completed outcome", async () => {
    const reply = await harnessFor({ turn: completed }).ask("fix it", "/work");
    expect(reply).toMatchObject({
      text: "done",
      run: {
        outcome: "completed",
        harness: "codex",
        model: "gpt-5",
        tokens: { input: 6563, output: 5, cacheRead: 11008, cacheWrite: 0 },
        costSource: "computed",
      },
    });
    expect(reply.run.costUsd).toBeCloseTo(0.00962975, 10);
  });

  it("preserves a failed app-server reply rather than manufacturing a completion", async () => {
    const reply = await harnessFor({
      turn: {
        status: "failed",
        items: [],
        error: { message: "bad request", codexErrorInfo: "badRequest" },
        usage: { inputTokens: 2, outputTokens: 3 },
      },
    }).ask("fix it", "/work");
    expect(reply.run).toMatchObject({
      outcome: "failed",
      tokens: { input: 2, output: 3 },
      costSource: "computed",
    });
  });

  it.each(["usageLimitExceeded", "rateLimitExceeded"])(
    "recognizes the structured %s signal",
    async (code) => {
      const reply = await harnessFor({
        turn: {
          status: "failed",
          items: [],
          error: { message: "limited", codexErrorInfo: code },
        },
        limits: { rateLimits: { primary: { resetsAt: 1_800_000_000 } } },
      }).ask("fix it", "/work");
      expect(reply.run.outcome).toBe("rate-limited");
      expect(reply.run.retryAfterMs).toEqual(expect.any(Number));
    },
  );

  it("does not infer a limit from prose", () => {
    expect(isLimited("you have been rate limited")).toBe(false);
    expect(
      classify({
        status: "failed",
        items: [],
        error: { message: "rate limited in prose" },
      }),
    ).toBe("failed");
    expect(
      resetAt({
        rateLimits: { primary: { resetsAt: 10 }, secondary: { resetsAt: 5 } },
      }),
    ).toBe(5_000);
  });

  it("uses actual app-server lifecycle and an isolated fresh CODEX_HOME", async () => {
    const userHome = fs.mkdtempSync(path.join(os.tmpdir(), "amy-user-codex-"));
    fs.writeFileSync(
      path.join(userHome, "config.toml"),
      "[hooks]\nenabled=true\n",
    );
    fs.writeFileSync(path.join(userHome, "auth.json"), "credential");
    const reply = await new CodexHarness(
      new ScriptedRunner(),
      { model: "gpt-5" },
      fakeServer("normal", { CODEX_HOME: userHome }),
    ).ask("read it", process.cwd(), { readOnly: true });
    expect(reply.text).toBe("authenticated");
    expect(reply.run.tokens).toEqual({
      input: 6563,
      output: 5,
      cacheRead: 11008,
      cacheWrite: 0,
    });
    expect(reply.run.costUsd).toBeCloseTo(0.00962975, 10);
  });

  it("sends the 0.166 feature map with approvals disabled", async () => {
    const result = await fakeServer("protocol-config").run({
      prompt: "read it",
      cwd: process.cwd(),
      readOnly: true,
    });
    expect(result.turn.status).toBe("completed");
  });

  it("keeps its thirty-minute default when an optional timeout is undefined", () => {
    const app = new StdioCodexAppServer({ timeoutMs: undefined });
    expect((app as unknown as { options: { timeoutMs: number } }).options.timeoutMs).toBe(
      30 * 60 * 1000,
    );
  });

  it("preserves split multibyte stdout and stderr", async () => {
    const result = await fakeServer("split-utf8").run({
      prompt: "read it",
      cwd: process.cwd(),
      readOnly: true,
    });
    expect(result.turn.items[0]?.text).toBe("café");

    const stderr = await fakeServer("split-stderr").run({
      prompt: "read it",
      cwd: process.cwd(),
      readOnly: true,
    });
    expect(stderr.turn.error?.message).toContain("café");
  });

  it("keeps a streamed partial reply when a limited turn has no items", async () => {
    const reply = await new CodexHarness(
      new ScriptedRunner(),
      { model: "gpt-5" },
      fakeServer("streamed-limit"),
    ).ask("read it", process.cwd());
    expect(reply).toMatchObject({
      text: "half-done é",
      run: {
        outcome: "rate-limited",
        tokens: { input: 6563, output: 5, cacheRead: 11008 },
      },
    });
  });

  it("settles when a child ignores SIGTERM", async () => {
    const result = await fakeServer("ignore-term").run({
      prompt: "read it",
      cwd: process.cwd(),
      readOnly: true,
    });
    expect(result.turn.status).toBe("failed");
  });

  it("keeps the app-server child on the runner cancellation lifecycle", async () => {
    const runner = new NodeCommandRunner();
    const running = fakeServer("cancellable", {}, runner).run({
      prompt: "read it",
      cwd: process.cwd(),
      readOnly: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runner.killAll()).toBe(1);
    await expect(running).resolves.toMatchObject({ turn: { status: "abandoned" } });
  });

  it.each([
    [
      "missing executable",
      new StdioCodexAppServer({
        timeoutMs: 40,
        command: path.join(os.tmpdir(), "does-not-exist-codex"),
      }),
    ],
    ["premature child exit", fakeServer("premature-exit")],
    ["initialization timeout", fakeServer("initialize-timeout")],
    ["rate-limit lookup exit", fakeServer("rate-exit")],
  ])("settles instead of hanging on %s", async (_name, server) => {
    const result = await Promise.race([
      server.run({ prompt: "go", cwd: process.cwd(), readOnly: false }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("test timed out")), 500),
      ),
    ]);
    if (_name === "rate-limit lookup exit") {
      expect(result.turn.error?.codexErrorInfo).toBe("usageLimitExceeded");
    } else {
      expect(result.turn.status).toBe("failed");
      expect(result.turn.error?.message).toMatch(/codex app-server|spawn/);
    }
  });
});

describe("the captured protocol schema", () => {
  it("parses the captured 0.166.0 schema and retains fields the client sends", () => {
    // The capture has a literal trailing `\\n` from the app-server transport.
    const schema = JSON.parse(
      fs.readFileSync(fixture, "utf8").replace(/\\n\s*$/, ""),
    ) as {
      generatedBy: string;
      definitions: Record<
        string,
        { properties?: Record<string, unknown>; required?: string[] }
      >;
    };
    expect(schema.generatedBy).toBe("codex-cli 0.166.0");
    expect(schema.definitions.ThreadStartParams!.properties).toMatchObject({
      cwd: expect.anything(),
      model: expect.anything(),
      config: expect.anything(),
      approvalPolicy: expect.anything(),
    });
    expect(schema.definitions.Turn!.properties).not.toHaveProperty("usage");
    expect(schema.definitions.TurnStartParams!.required).toEqual(
      expect.arrayContaining(["input", "threadId"]),
    );
    expect(schema.definitions.GetAccountRateLimitsResponse!.required).toContain(
      "rateLimits",
    );
  });
});

describe("usage mapping", () => {
  it("subtracts cached input exactly once and says absent usage is absent", () => {
    expect(tokensOfTurn(completed)).toEqual({
      input: 6563,
      output: 5,
      cacheRead: 11008,
      cacheWrite: 0,
    });
    expect(tokensOfTurn({ status: "completed", items: [] })).toBeUndefined();
  });
});
