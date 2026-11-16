import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AskContext, Harness } from "@amykit/core";
import { ScriptedRunner, fakeRun } from "@amykit/test-fixtures";
import { ClaudeHarness } from "../../../plugins/claude/src/ClaudeHarness.js";
import { CodexHarness, StdioCodexAppServer } from "../../../plugins/codex/src/CodexHarness.js";
import { HermesHarness } from "../../../plugins/hermes-agent/src/HermesHarness.js";
import { Granted, harnessConformance } from "../src/index.js";

/** A harness that hands each run what `hand` says, and remembers it the way a CLI's arguments would. */
function handing(hand: (context: AskContext) => Granted, lendsSkill = true) {
  let last: Granted = "nothing";
  const harness: Harness = {
    name: "handing",
    ...(lendsSkill ? { lendsSkill: true } : {}),
    ask: async (_prompt, _cwd, context = {}) => {
      last = hand(context);
      return { text: "done", run: fakeRun() };
    },
  };
  return () => ({ harness, granted: () => last });
}

describe("a harness's writing and read-only runs", () => {
  it("conforms when the writing run may write and the read-only one may only read", async () => {
    expect(await harnessConformance(handing((context) => (context.readOnly ? "read-only" : "write")))).toEqual([]);
  });

  it("fails a harness whose writing run is handed nothing, the way claude 0.7.1 passed no mode", async () => {
    expect(await harnessConformance(handing((context) => (context.readOnly ? "read-only" : "nothing")))).toEqual([
      "a writing run is handed no way to write",
    ]);
  });

  it("fails a harness whose read-only run is handed a way to write", async () => {
    expect(await harnessConformance(handing(() => "write"))).toEqual(["a read-only run is handed a way to write"]);
  });

  it("names the run that threw rather than calling it conforming", async () => {
    const harness: Harness = { name: "missing", ask: async () => { throw new Error("no CLI"); } };
    expect(await harnessConformance(() => ({ harness, granted: () => "write" }))).toEqual([
      "a writing run threw: no CLI",
      "a read-only run threw: no CLI",
    ]);
  });
});

describe("a skill turn on a harness that cannot take one (A8)", () => {
  it("fails a harness that answers it instead of refusing", async () => {
    const findings = await harnessConformance(
      handing((context) => (context.readOnly ? "read-only" : "write"), false),
    );

    expect(findings).toContain("a skill turn was answered by a harness that does not lend the skill");
  });

  it("accepts a harness that refuses the skill turn it cannot take", async () => {
    let readOnly = false;
    const harness: Harness = {
      name: "bare",
      ask: async (_prompt, _cwd, context = {}) => {
        readOnly = Boolean(context.readOnly);
        return { text: "", run: fakeRun({ outcome: "failed" }) };
      },
    };

    expect(await harnessConformance(() => ({ harness, granted: () => (readOnly ? "read-only" : "write") }))).toEqual([]);
  });
});

/** A stand-in codex app-server that says whether the lent skill reached its home. */
const CODEX_STAND_IN = `
const fs = require("node:fs");
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
process.stdin.on("data", chunk => {
  for (const line of String(chunk).trim().split("\\n")) {
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === "initialize") reply(request.id, {});
    else if (request.method === "thread/start") {
      const lent = fs.existsSync(process.env.CODEX_HOME + "/skills/amy-groom/SKILL.md");
      fs.writeFileSync(process.env.AMY_LENT_FILE, lent ? "lent" : "bare");
      reply(request.id, { thread: { id: "thread-1" } });
    } else if (request.method === "turn/start") {
      reply(request.id, {});
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { status: "completed", items: [{ type: "agentMessage", text: "done" }] } } }) + "\\n");
    }
  }
});
`;

describe("a skill reaches every harness (A9)", () => {
  it("hands /amy-groom to claude, codex and hermes through each one's own CLI", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-skill-every-"));
    const skill = path.join(root, "amy-groom");
    fs.mkdirSync(skill);
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# amy-groom\n");
    const context = { skill: { name: "amy-groom", path: skill } };
    try {
      // claude: a fresh --add-dir whose skills link to the skill.
      let claudeLent = false;
      const claude = new ClaudeHarness(
        new ScriptedRunner([
          {
            match: (_command, args) => {
              const at = args.indexOf("--add-dir");
              claudeLent = at >= 0 && fs.existsSync(path.join(args[at + 1]!, ".claude", "skills", "amy-groom", "SKILL.md"));
              return true;
            },
            result: { exitCode: 0, stdout: "" },
          },
        ]),
        {},
        root,
      );
      await claude.ask("/amy-groom\n\ngo", root, context);
      expect(claude.lendsSkill).toBe(true);
      expect(claudeLent).toBe(true);

      // hermes: -s, resolved through the profile's external_dirs.
      let hermesArgs: string[] = [];
      const hermes = new HermesHarness(
        new ScriptedRunner([
          { match: (_command, args) => { hermesArgs = [...args]; return true; }, result: { exitCode: 0, stdout: "done" } },
        ]),
        { profile: "amy" },
        root,
      );
      await hermes.ask("/amy-groom\n\ngo", root, context);
      expect(hermes.lendsSkill).toBe(true);
      expect(hermesArgs[hermesArgs.indexOf("-s") + 1]).toBe("amy-groom");

      // codex: a link in the fresh home the run gets.
      const script = path.join(root, "codex-stand-in.cjs");
      fs.writeFileSync(script, CODEX_STAND_IN);
      const lent = path.join(root, "codex-lent");
      const codex = new CodexHarness(
        new ScriptedRunner(),
        {},
        new StdioCodexAppServer({
          timeoutMs: 2_000,
          command: process.execPath,
          args: [script],
          env: { AMY_LENT_FILE: lent },
          shutdownGraceMs: 20,
        }),
      );
      await codex.ask("/amy-groom\n\ngo", root, context);
      expect(codex.lendsSkill).toBe(true);
      expect(fs.readFileSync(lent, "utf8")).toBe("lent");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
