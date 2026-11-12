import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { harnesses, install, installedHarnesses } from "../src/harnesses.js";
import { shipped } from "../src/skills.js";
import { locateSkill, readSkills, recordWrite, skillRoots, writeSkills } from "../src/skills-record.js";

describe("the harnesses on a machine", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-harness-"));
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("knows the ones that read a SKILL.md", () => {
    expect(harnesses(home).map((h) => h.name)).toEqual(["claude", "codex", "hermes"]);
  });

  it("finds none on a machine that has none", () => {
    expect(installedHarnesses(home)).toEqual([]);
  });

  it("finds the ones whose directory is there", () => {
    fs.mkdirSync(path.join(home, ".hermes"));

    expect(installedHarnesses(home).map((h) => h.name)).toEqual(["hermes"]);
  });

  it("writes one directory per skill, each holding a SKILL.md", () => {
    const into = path.join(home, "skills");
    const files = install(into, [
      ["amy", "# driving it\n"],
      ["amy-workflow", "# writing one\n"],
    ]);

    expect(files).toHaveLength(2);
    expect(fs.readFileSync(path.join(into, "amy", "SKILL.md"), "utf-8")).toBe("# driving it\n");
  });

  it("overwrites, because a skill travels with the amy that ships it", () => {
    const into = path.join(home, "skills");
    install(into, [["amy", "old\n"]]);
    install(into, [["amy", "new\n"]]);

    expect(fs.readFileSync(path.join(into, "amy", "SKILL.md"), "utf-8")).toBe("new\n");
  });
});

describe("the skills that travel with this build", () => {
  it("are read off disk beside the code, not listed in it", () => {
    const names = shipped().map(([name]) => name);

    expect(names).toContain("amy");
    expect(names).toContain("amy-workflow");
  });

  it("carry their body, not just their name", () => {
    const [, body] = shipped().find(([name]) => name === "amy")!;

    expect(body).toContain("name: amy");
  });

  it("include the groomer, which carries the method and takes the format from the workflow that judges the brief", () => {
    const [, body] = shipped().find(([name]) => name === "amy-groom")!;

    expect(body).toContain("name: amy-groom");
    expect(body).toContain("a requirement names its source, or it is cut");
    expect(body).toContain("the parser wins");
  });

  it("are none when there is no directory to read", () => {
    expect(shipped(new URL("file:///no/such/place/"))).toEqual([]);
  });
});

describe("amy's own skill root (A1)", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-own-skills-"));
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("holds every shipped skill whether or not a harness was chosen", () => {
    const wrote = writeSkills(home, install, () => [["amy", "# driving it\n"], ["amy-groom", "# grooming\n"]], () => undefined);

    expect(wrote).toHaveLength(2);
    expect(fs.readFileSync(path.join(home, "skills", "amy", "SKILL.md"), "utf-8")).toBe("# driving it\n");
    expect(fs.readFileSync(path.join(home, "skills", "amy-groom", "SKILL.md"), "utf-8")).toBe("# grooming\n");
    // Choosing no harness records none: a harness's own directory stays an extra.
    expect(readSkills(home)).toEqual({ harnesses: [], directories: [] });
  });

  it("writes the harness a record names beside its own copy", () => {
    const into = path.join(home, ".claude", "skills");
    recordWrite(home, { harness: "claude" });

    const wrote = writeSkills(home, install, () => [["amy", "# driving it\n"]], () => into);

    expect(wrote).toHaveLength(2);
    expect(fs.readFileSync(path.join(into, "amy", "SKILL.md"), "utf-8")).toBe("# driving it\n");
    expect(fs.readFileSync(path.join(home, "skills", "amy", "SKILL.md"), "utf-8")).toBe("# driving it\n");
  });

  it("fails naming its own root when that directory cannot be written", () => {
    fs.writeFileSync(path.join(home, "skills"), "not a directory");

    expect(() => writeSkills(home, install, () => [["amy", "# driving it\n"]], () => undefined)).toThrow(/skills/);
  });

  it("looks a skill up in its own root first, then the harness's own", () => {
    install(path.join(home, "skills"), [["amy-groom", "# grooming\n"]]);

    expect(skillRoots(home)).toEqual([path.join(home, "skills"), "~/.claude/skills"]);
    expect(locateSkill(skillRoots(home), "amy-groom")).toBe(path.join(home, "skills", "amy-groom"));
    expect(locateSkill(skillRoots(home), "not-installed")).toBeUndefined();
  });
});
