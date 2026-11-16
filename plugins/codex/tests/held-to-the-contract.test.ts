import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeCommandRunner } from "@amykit/core";
import * as fixtures from "@amykit/test-fixtures";
import { CodexHarness, StdioCodexAppServer } from "../src/CodexHarness.js";

type Validator = (method: string, params: unknown) => void;

/** The vendored app-server protocol's check, from the shared fixtures. */
const assertValidCodexRequest = (fixtures as Record<string, unknown>).assertValidCodexRequest as Validator | undefined;

/** A stand-in app-server that records every request it is sent. */
const RECORDING = `
const fs = require("node:fs");
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
process.stdin.on("data", chunk => {
  for (const line of String(chunk).trim().split("\\n")) {
    if (!line) continue;
    const request = JSON.parse(line);
    fs.appendFileSync(process.env.AMY_REQUESTS, JSON.stringify(request) + "\\n");
    if (request.id === undefined) continue;
    if (request.method === "thread/start") reply(request.id, { thread: { id: "thread-1" } });
    else if (request.method === "turn/start") {
      reply(request.id, {});
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { status: "completed", items: [{ type: "agentMessage", text: "done" }] } } }) + "\\n");
    } else reply(request.id, {});
  }
});
`;

describe("codex, held to the app-server protocol it was vendored from", () => {
  it("refuses a request the protocol does not have", () => {
    expect(assertValidCodexRequest).toBeTypeOf("function");
    expect(() => assertValidCodexRequest!("turn/start", { threadId: "t", input: [{ type: "slash", name: "amy-groom" }] })).toThrow();
  });

  it("sends only requests the protocol takes, on a skill turn", async () => {
    expect(assertValidCodexRequest).toBeTypeOf("function");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-codex-contract-"));
    try {
      const skill = path.join(root, "amy-groom");
      fs.mkdirSync(skill);
      fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: amy-groom\ndescription: groom a ticket\n---\n# amy-groom\n");
      const script = path.join(root, "app-server.cjs");
      fs.writeFileSync(script, RECORDING);
      const requests = path.join(root, "requests.jsonl");
      const harness = new CodexHarness(
        new NodeCommandRunner(),
        { model: "gpt-5" },
        new StdioCodexAppServer({
          timeoutMs: 2_000,
          command: process.execPath,
          args: [script],
          env: { AMY_REQUESTS: requests },
          runner: new NodeCommandRunner(),
          shutdownGraceMs: 20,
        }),
      );

      await harness.ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: skill } });

      const sent = fs
        .readFileSync(requests, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { method: string; params?: unknown });
      expect(sent.map((request) => request.method)).toContain("turn/start");
      for (const request of sent) assertValidCodexRequest!(request.method, request.params ?? {});
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
