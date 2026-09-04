import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installedSkills, parseSkills, skillsNamed } from "../src/skills.js";

/** The problems, or a failure saying the config was wrongly accepted. */
function problemsOf(value: unknown): string[] {
  const parsed = parseSkills(value);
  expect(parsed.ok).toBe(false);
  return parsed.ok ? [] : parsed.problems;
}

describe("parseSkills", () => {
  it("reads a ladder per step and drops the leading slash", () => {
    const parsed = parseSkills({ triage: ["/logion"], "address-threads": ["/northwind-code-review"] });

    expect(parsed).toEqual({
      ok: true,
      ladders: { triage: ["logion"], "address-threads": ["northwind-code-review"] },
    });
  });

  it("means no skill at all when nothing is configured", () => {
    expect(parseSkills(undefined)).toEqual({ ok: true, ladders: {} });
    expect(parseSkills({})).toEqual({ ok: true, ladders: {} });
  });

  it("refuses a step no agent performs, and says which ones it does", () => {
    // `open-pull-request` is a real action and it goes to the code host, so a
    // skill for it would never be asked. That is a typo, not a preference.
    const problems = problemsOf({ "open-pull-request": ["/logion"] });

    expect(problems.join("\n")).toContain("triage, implement, address-threads");
  });

  it("refuses a step that names nothing", () => {
    expect(problemsOf({ triage: [] }).join("\n")).toContain("names no skill");
  });

  it("refuses a ladder that is not a list of names", () => {
    expect(problemsOf({ triage: "/logion" }).join("\n")).toContain("must be a list");
  });

  it("reports every problem rather than the first", () => {
    expect(problemsOf({ nonsense: ["/a"], triage: [] })).toHaveLength(2);
  });
});

describe("skillsNamed", () => {
  it("names each skill once, however many steps asked for it", () => {
    expect(skillsNamed({ triage: ["logion"], implement: ["logion", "other"] })).toEqual([
      "logion",
      "other",
    ]);
  });
});

describe("installedSkills", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-skills-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function install(name: string, withFile = true): void {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    if (withFile) fs.writeFileSync(path.join(root, name, "SKILL.md"), "# a skill\n");
  }

  it("finds a directory holding a SKILL.md", () => {
    install("logion");
    install("northwind-code-review");

    expect(installedSkills([root])).toEqual(["logion", "northwind-code-review"]);
  });

  it("does not count a directory with no SKILL.md in it", () => {
    // The harness looks for that file too. A directory without one is a
    // leftover, and calling it installed would let boot pass on a skill that
    // cannot answer.
    install("half-installed", false);

    expect(installedSkills([root])).toEqual([]);
  });

  it("shrugs at a root that does not exist", () => {
    expect(installedSkills([path.join(root, "nowhere")])).toEqual([]);
  });
});
