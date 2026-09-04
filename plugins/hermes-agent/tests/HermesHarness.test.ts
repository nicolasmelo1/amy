import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ScriptedRunner } from "@amy/test-fixtures";
import { HermesHarness, HermesUsage, classify, cost, readUsage, tokensOf } from "../src/index.js";

/**
 * A real `--usage-file` report, copied verbatim from a run.
 *
 * The arithmetic in it is the whole reason this is a capture:
 * 7466 + 8704 + 5 = 16175, which is its own `total_tokens`. So `input_tokens`
 * here **excludes** cache reads, the opposite of what codex means by the same
 * field name.
 */
const REAL_USAGE: HermesUsage = {
  estimated_cost_usd: 0.0,
  cost_status: "included",
  cost_source: "none",
  input_tokens: 7466,
  output_tokens: 5,
  cache_read_tokens: 8704,
  cache_write_tokens: 0,
  model: "gpt-5.6-luna",
  provider: "openai-codex",
  completed: true,
  failed: false,
};

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amy-hermes-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * A hermes that writes its report, the way the real one does.
 *
 * The path is generated inside the harness, so the only way to stand in for
 * the CLI is to write the file when the command is matched. That is precisely
 * the side effect being tested.
 */
function hermesWriting(usage: HermesUsage | null, ok = true) {
  const runner = new ScriptedRunner([
    {
      match: (command, args) => {
        if (command !== "hermes") return false;
        const file = args[args.indexOf("--usage-file") + 1];
        if (usage && file) fs.writeFileSync(file, JSON.stringify(usage));
        return true;
      },
      result: { stdout: "the work is done", exitCode: ok ? 0 : 1 },
    },
  ]);

  return { runner, harness: new HermesHarness(runner, {}, tmp) };
}

describe("how it calls the CLI", () => {
  it("asks for one shot and for the account beside it", async () => {
    const { runner, harness } = hermesWriting(REAL_USAGE);

    await harness.ask("fix the invoice total", "/w/northwind/backend");

    const args = runner.argvFor("hermes");
    // -z prints only the final response, which is the only part worth parsing.
    expect(args[0]).toBe("-z");
    expect(args[1]).toBe("fix the invoice total");
    expect(args).toContain("--usage-file");
    expect(runner.callsTo("hermes")[0]?.options?.cwd).toBe("/w/northwind/backend");
  });

  it("uses the short model flag, which is the one hermes accepts", async () => {
    const runner = new ScriptedRunner([]);
    await new HermesHarness(runner, { model: "gpt-5" }, tmp).ask("go", "/w");

    expect(runner.argvFor("hermes")).toContain("-m");
    expect(runner.argvFor("hermes")).toContain("gpt-5");
  });

  it("cleans up the report it asked for", async () => {
    const { harness } = hermesWriting(REAL_USAGE);

    await harness.ask("go", "/w");

    // A run every few minutes would otherwise leave a file behind each time.
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it("prefers the model the report names over the one that was asked for", async () => {
    const { harness } = hermesWriting(REAL_USAGE);

    const reply = await harness.ask("go", "/w");

    // What actually ran beats what was requested, since hermes may fall back.
    expect(reply.run.model).toBe("gpt-5.6-luna");
  });
});

describe("the tokens, against the convention hermes actually uses", () => {
  it("maps the counts straight across, cache excluded from input", () => {
    expect(tokensOf(REAL_USAGE)).toEqual({
      input: 7466,
      output: 5,
      cacheRead: 8704,
      cacheWrite: 0,
    });
  });

  it("adds up to the total the report states", () => {
    const tokens = tokensOf(REAL_USAGE)!;
    // Subtracting the cache here, as the codex mapping does, would lose 8704
    // tokens off every budget window.
    expect(tokens.input + tokens.output + tokens.cacheRead).toBe(16175);
  });

  it("says nothing rather than zero when there is no report", () => {
    expect(tokensOf(undefined)).toBeUndefined();
  });
});

describe("what it cost, and how that is known", () => {
  it("calls a subscription run zero and means it", () => {
    // `included` is the one case where zero is the answer rather than a gap,
    // and conflating the two would make a real spend look free.
    expect(cost(REAL_USAGE, tokensOf(REAL_USAGE), "gpt-5.6-luna")).toEqual({
      costUsd: 0,
      costSource: "included",
    });
  });

  it("records a priced run as computed, because hermes calls it an estimate", () => {
    const paid = { ...REAL_USAGE, cost_status: "estimated", estimated_cost_usd: 0.42 };

    expect(cost(paid, tokensOf(paid), "gpt-5")).toEqual({
      costUsd: 0.42,
      costSource: "computed",
    });
  });

  it("falls back to the vendored table when the report priced nothing", () => {
    const silent = { ...REAL_USAGE, cost_status: "unknown", estimated_cost_usd: 0 };

    const result = cost(silent, tokensOf(silent), "gpt-5");

    expect(result.costSource).toBe("computed");
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("admits it does not know when neither the report nor the table can say", () => {
    const silent = { ...REAL_USAGE, cost_status: "unknown", estimated_cost_usd: 0 };

    expect(cost(silent, tokensOf(silent), "gpt-6-imaginary")).toEqual({ costSource: "unknown" });
  });
});

describe("reading the report", () => {
  it("returns nothing when the file was never written", () => {
    expect(readUsage(path.join(tmp, "absent.json"))).toBeUndefined();
  });

  it("returns nothing rather than throwing on a half-written file", () => {
    const file = path.join(tmp, "truncated.json");
    fs.writeFileSync(file, '{"input_tokens": 7466');

    // A killed hermes can leave the file mid-write, and that should cost the
    // accounting, not the run.
    expect(readUsage(file)).toBeUndefined();
  });
});

describe("which outcome it was", () => {
  it("believes the report over the exit code", () => {
    expect(classify({ ...REAL_USAGE, failed: true, completed: false }, true)).toBe("failed");
    expect(classify(REAL_USAGE, false)).toBe("completed");
  });

  it("calls a missing report with a bad exit abandoned, which is a missing binary", () => {
    // No report at all means hermes never ran. `amy doctor` is what catches
    // this, and the relay deliberately stops rather than trying elsewhere.
    expect(classify(undefined, false)).toBe("abandoned");
  });

  it("trusts a clean exit that wrote no report", () => {
    expect(classify(undefined, true)).toBe("completed");
  });

  it("cannot tell a rate limit from a failure, and does not pretend to", async () => {
    const { harness } = hermesWriting({ ...REAL_USAGE, failed: true, completed: false }, false);

    const reply = await harness.ask("go", "/w");

    expect(reply.run.outcome).toBe("failed");
    // Even so, the spend is still recorded: hermes writes the account even
    // for a run that failed, which is the nicest of the three harnesses.
    expect(reply.run.tokens?.input).toBe(7466);
  });
});
