import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeCommandRunner } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { CodexHarness, StdioCodexAppServer } from "../src/CodexHarness.js";

/**
 * A stand-in `codex app-server` that discovers user skills the way codex-cli
 * 0.166.0 does, and reports what a turn could see and what it was asked.
 *
 * Measured against the real 0.166.0 binary (`skills/list` over a fresh
 * CODEX_HOME) and its source, codex-rs/ext/skills/src/host_roots.rs at
 * rust-v0.166.0:
 *   - it scans BOTH `$CODEX_HOME/skills` (deprecated, kept) and
 *     `$HOME/.agents/skills` (the documented user root) as user roots;
 *   - it follows a symlinked skill directory in a user root;
 *   - it refuses a SKILL.md without YAML frontmatter
 *     ("missing YAML frontmatter delimited by ---").
 * A skill is invoked explicitly by a `{ type: "skill", name, path }` input on
 * `turn/start` (codex-rs/ext/skills/src/selection.rs) or a `$name` mention;
 * a leading `/name` is not a skill mention to codex.
 */
const STAND_IN = `
const fs = require("node:fs");
const path = require("node:path");
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
function userSkills() {
  const roots = [path.join(process.env.CODEX_HOME, "skills"), path.join(process.env.HOME, ".agents", "skills")];
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (entry.startsWith(".")) continue;
      const file = path.join(root, entry, "SKILL.md");
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      const front = /^---\\n([\\s\\S]*?)\\n---/.exec(text);
      if (!front) continue;
      const name = /^name:\\s*(.+)$/m.exec(front[1]);
      found.push({ name: name ? name[1].trim() : entry, path: fs.realpathSync(file) });
    }
  }
  return found;
}
process.stdin.on("data", chunk => {
  for (const line of String(chunk).trim().split("\\n")) {
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === "initialize") reply(request.id, {});
    else if (request.method === "thread/start") reply(request.id, { thread: { id: "thread-1" } });
    else if (request.method === "turn/start") {
      fs.writeFileSync(process.env.AMY_REPORT, JSON.stringify({ skills: userSkills(), input: request.params.input }));
      reply(request.id, {});
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { status: "completed", items: [{ type: "agentMessage", text: "done" }] } } }) + "\\n");
    }
  }
});
`;

interface Report {
  skills: { name: string; path: string }[];
  input: { type: string; name?: string; path?: string; text?: string }[];
}

let root: string;
let operatorHome: string;
let report: string;

const FRONTMATTER = "---\nname: amy-groom\ndescription: groom a ticket into a brief\n---\n# amy-groom\n";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-codex-skill-turn-"));
  // The operator's own machine: a personal skill in the documented user root,
  // and a CODEX_HOME holding a credential.
  operatorHome = path.join(root, "operator");
  fs.mkdirSync(path.join(operatorHome, ".agents", "skills", "operator-only"), { recursive: true });
  fs.writeFileSync(
    path.join(operatorHome, ".agents", "skills", "operator-only", "SKILL.md"),
    "---\nname: operator-only\ndescription: the operator's own\n---\n",
  );
  fs.mkdirSync(path.join(operatorHome, ".codex"));
  fs.writeFileSync(path.join(operatorHome, ".codex", "auth.json"), "credential");
  report = path.join(root, "report.json");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function skillAt(name: string, body: string | undefined): string {
  const directory = path.join(root, "amy-skills", name);
  fs.mkdirSync(directory, { recursive: true });
  if (body !== undefined) fs.writeFileSync(path.join(directory, "SKILL.md"), body);
  return directory;
}

function codex(): CodexHarness {
  const script = path.join(root, "app-server.cjs");
  fs.writeFileSync(script, STAND_IN);
  return new CodexHarness(
    new ScriptedRunner(),
    { model: "gpt-5" },
    new StdioCodexAppServer({
      timeoutMs: 2_000,
      command: process.execPath,
      args: [script],
      env: { HOME: operatorHome, CODEX_HOME: path.join(operatorHome, ".codex"), AMY_REPORT: report },
      runner: new NodeCommandRunner(),
      shutdownGraceMs: 20,
    }),
  );
}

const read = (): Report => JSON.parse(fs.readFileSync(report, "utf8")) as Report;

describe("a codex turn addressed to a skill", () => {
  it("sees the lent skill and no skill of the operator's", async () => {
    const skill = skillAt("amy-groom", FRONTMATTER);

    const reply = await codex().ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: skill } });

    expect(reply.run.outcome).toBe("completed");
    expect(read().skills.map((one) => one.name).sort()).toEqual(["amy-groom"]);
  });

  it("asks codex for the lent skill explicitly, by the path of its SKILL.md", async () => {
    const skill = skillAt("amy-groom", FRONTMATTER);

    await codex().ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: skill } });

    const named = read().input.find((item) => item.type === "skill");
    expect(named?.name).toBe("amy-groom");
    expect(named?.path && fs.realpathSync(named.path)).toBe(fs.realpathSync(path.join(skill, "SKILL.md")));
  });

  it("names the skill by the canonical path codex catalogs, when amy's root holds a link to it", async () => {
    // Measured with two real codex-cli 0.166.0 turns: codex canonicalizes a
    // discovered skill's path and compares the `skill` input's path as a raw
    // string. Sent through the link, the input was ignored and the turn
    // completed without the skill; sent canonical, the skill was loaded.
    const real = skillAt("amy-groom", FRONTMATTER);
    const amyRoot = path.join(root, "amy-root");
    fs.mkdirSync(amyRoot);
    fs.symlinkSync(real, path.join(amyRoot, "amy-groom"), "dir");

    await codex().ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: path.join(amyRoot, "amy-groom") } });

    const named = read().input.find((item) => item.type === "skill");
    expect(named?.path).toBe(fs.realpathSync(path.join(real, "SKILL.md")));
    expect(read().skills.map((one) => one.path)).toContain(named?.path);
  });

  it("is refused before a turn starts when the directory holds no SKILL.md", async () => {
    const skill = skillAt("amy-groom", undefined);

    const reply = await codex().ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: skill } });

    expect(fs.existsSync(report)).toBe(false);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("amy-groom");
  });

  it("is refused before a turn starts when codex could not load the SKILL.md", async () => {
    const skill = skillAt("amy-groom", "# amy-groom\n\nno frontmatter\n");

    const reply = await codex().ask("/amy-groom\n\ngroom it", root, { skill: { name: "amy-groom", path: skill } });

    expect(fs.existsSync(report)).toBe(false);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("amy-groom");
  });
});
