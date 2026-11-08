import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HostServices, NodeCommandRunner, mount } from "@amykit/core";
import { USAGE_COLLECTION } from "@amykit/agent-kit";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { CodexUsageReader } from "../src/usage.js";
import { StdioCodexAppServer } from "../src/CodexHarness.js";
import { plugin } from "../src/plugin.js";

describe("Codex usage", () => {
  it("contributes one reader", async () => {
    const host: HostServices = {
      runner: new ScriptedRunner([
        {
          match: (command, args) => command === "codex" && args[0] === "--version",
          result: { stdout: "codex-cli 0.166.4" },
        },
      ]),
      now: () => new Date(),
      paths: { state: "/state" },
    };

    const mounted = await mount([plugin], {}, host);

    expect(
      mounted.ok && [...mounted.mounted.contributions.get(USAGE_COLLECTION)!.keys()],
    ).toEqual(["Codex"]);
  });

  it("normalizes primary and secondary account windows", async () => {
    const reader = new CodexUsageReader({
      readRateLimits: async () => ({
        rateLimits: {
          primary: {
            usedPercent: 24,
            windowDurationMins: 300,
            resetsAt: 1_800_000_000,
          },
          secondary: {
            usedPercent: 61,
            windowDurationMins: 10_080,
            resetsAt: 1_800_604_800,
          },
        },
      }),
    });

    await expect(reader.read()).resolves.toEqual({
      windows: [
        {
          label: "five-hour",
          usedPercent: 24,
          startsAt: "2027-01-15T03:00:00.000Z",
          resetsAt: "2027-01-15T08:00:00.000Z",
        },
        {
          label: "weekly",
          usedPercent: 61,
          startsAt: "2027-01-15T08:00:00.000Z",
          resetsAt: "2027-01-22T08:00:00.000Z",
        },
      ],
    });
  });

  it("returns unavailable when the account lookup fails or has no usable windows", async () => {
    await expect(
      new CodexUsageReader({
        readRateLimits: async () => {
          throw new Error("Codex is not signed in");
        },
      }).read(),
    ).resolves.toEqual({ unavailable: "Codex is not signed in" });

    await expect(
      new CodexUsageReader({ readRateLimits: async () => ({ rateLimits: {} }) }).read(),
    ).resolves.toEqual({ unavailable: "Codex returned no account rate limits" });

    await expect(
      new CodexUsageReader({
        readRateLimits: async () => ({
          rateLimits: { primary: { usedPercent: 12, resetsAt: null } },
        }),
      }).read(),
    ).resolves.toEqual({
      windows: [{ label: "primary", usedPercent: 12 }],
    });
  });

  it("labels a window from its reported duration, not its quota slot", async () => {
    const reader = new CodexUsageReader({
      readRateLimits: async () => ({
        rateLimits: {
          primary: { usedPercent: 24, windowDurationMins: 10_080 },
          secondary: { usedPercent: 61, windowDurationMins: 300 },
        },
      }),
    });

    await expect(reader.read()).resolves.toEqual({
      windows: [
        { label: "weekly", usedPercent: 24 },
        { label: "five-hour", usedPercent: 61 },
      ],
    });
  });

  it("uses only initialize and account/rateLimits/read", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-codex-usage-"));
    const script = path.join(root, "server.cjs");
    fs.writeFileSync(
      script,
      `
const requests = [];
const reply = (id, result) => process.stdout.write(JSON.stringify({jsonrpc: "2.0", id, result}) + "\\n");
process.stdin.on("data", chunk => {
  for (const line of String(chunk).trim().split("\\n")) {
    if (!line) continue;
    const request = JSON.parse(line);
    requests.push(request.method);
    if (request.method === "initialize") reply(request.id, {});
    else if (request.method === "account/rateLimits/read") {
      if (requests.join(",") !== "initialize,account/rateLimits/read") process.exit(9);
      reply(request.id, {rateLimits: {primary: {usedPercent: 25, resetsAt: 1800000000}}});
    } else process.exit(8);
  }
});
`,
    );
    const server = new StdioCodexAppServer({
      command: process.execPath,
      args: [script],
      runner: new NodeCommandRunner(),
      timeoutMs: 500,
    });

    await expect(server.readRateLimits()).resolves.toEqual({
      rateLimits: { primary: { usedPercent: 25, resetsAt: 1_800_000_000 } },
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
