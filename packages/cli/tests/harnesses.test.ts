import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { harnesses, install, installedHarnesses } from "../src/harnesses.js";
import { shipped } from "../src/skills.js";

describe("the harnesses on a machine", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-harness-"));
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("knows the ones that read a SKILL.md", () => {
    expect(harnesses(home).map((h) => h.name)).toEqual(["claude", "hermes"]);
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

  it("are none when there is no directory to read", () => {
    expect(shipped(new URL("file:///no/such/place/"))).toEqual([]);
  });
});
