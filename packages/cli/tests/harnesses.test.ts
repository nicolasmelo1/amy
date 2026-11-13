import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { harnesses, install, installedHarnesses, linkHarnessSkills } from "../src/harnesses.js";
import { shipped } from "../src/skills.js";
import { locateSkill, readSkills, recordWrite, skillRoots, writeSkills } from "../src/skills-record.js";
import { HARNESS_COLLECTION } from "@amykit/agent-kit";
import { Harness, Plugin } from "@amykit/core";
import { linkableHarnesses, recoverChatParts } from "../src/assemble.js";

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

  it("looks a skill up in its own root, then the configured roots, and never in a harness's own", () => {
    install(path.join(home, "skills"), [["amy-groom", "# grooming\n"]]);

    expect(skillRoots(home)).toEqual([path.join(home, "skills")]);
    expect(skillRoots(home, ["~/shared/skills"])).toEqual([path.join(home, "skills"), "~/shared/skills"]);
    expect(locateSkill(skillRoots(home), "amy-groom")).toBe(path.join(home, "skills", "amy-groom"));
    expect(locateSkill(skillRoots(home), "not-installed")).toBeUndefined();
  });
});

describe("a harness's own skills are linked into amy's root by the config (A10, A11)", () => {
  let machine: string;
  let own: string;
  let table: { name: string; skills: string }[];
  let record: string;

  beforeEach(() => {
    machine = fs.mkdtempSync(path.join(os.tmpdir(), "amy-harness-link-"));
    own = path.join(machine, ".amy", "skills");
    // What the mounted harness plugins report, by their own names.
    table = [
      { name: "claude", skills: path.join(machine, ".claude", "skills") },
      { name: "codex", skills: path.join(machine, ".codex", "skills") },
    ];
    record = path.join(machine, ".amy", "harness-skills.json");
    skillIn(path.join(machine, ".claude", "skills"), "northwind-code-review");
    skillIn(path.join(machine, ".claude", "skills"), "amy-groom");
    skillIn(path.join(machine, ".codex", "skills"), "logion");
    // amy's own copy of a skill it ships, which a harness's never replaces.
    install(own, [["amy-groom", "# amy's own\n"]]);
  });

  afterEach(() => fs.rmSync(machine, { recursive: true, force: true }));

  function skillIn(root: string, name: string): void {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "SKILL.md"), `# ${name}\n`);
  }

  function links(): Record<string, string> {
    return Object.fromEntries(fs.readdirSync(own, { withFileTypes: true })
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => [entry.name, fs.readlinkSync(path.join(own, entry.name))]));
  }

  it("links each skill of a harness set to true, one link per skill, and copies nothing", () => {
    linkHarnessSkills(own, record, { claude: true }, table);

    expect(links()).toEqual({ "northwind-code-review": path.join(machine, ".claude", "skills", "northwind-code-review") });
    expect(locateSkill(skillRoots(path.dirname(own)), "northwind-code-review")).toBe(path.join(own, "northwind-code-review"));
  });

  it("keeps amy's own copy of a skill it ships, rather than the harness's", () => {
    linkHarnessSkills(own, record, { claude: true }, table);

    expect(fs.lstatSync(path.join(own, "amy-groom")).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(own, "amy-groom", "SKILL.md"), "utf-8")).toBe("# amy's own\n");
  });

  it("removes the links when the harness is set to false, or left out, and they come back with true", () => {
    linkHarnessSkills(own, record, { claude: true, codex: true }, table);
    expect(Object.keys(links()).sort()).toEqual(["logion", "northwind-code-review"]);

    linkHarnessSkills(own, record, { claude: false }, table);
    expect(links()).toEqual({});
    expect(fs.existsSync(path.join(machine, ".claude", "skills", "northwind-code-review", "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(own, "amy-groom", "SKILL.md"), "utf-8")).toBe("# amy's own\n");

    linkHarnessSkills(own, record, { claude: true }, table);
    expect(Object.keys(links())).toEqual(["northwind-code-review"]);
  });

  it("drops a link whose skill was deleted from the harness, and links one added since", () => {
    linkHarnessSkills(own, record, { claude: true }, table);
    fs.rmSync(path.join(machine, ".claude", "skills", "northwind-code-review"), { recursive: true });
    skillIn(path.join(machine, ".claude", "skills"), "acme-deploy");

    linkHarnessSkills(own, record, { claude: true }, table);

    expect(Object.keys(links())).toEqual(["acme-deploy"]);
  });

  it("leaves alone a link it did not make", () => {
    fs.mkdirSync(own, { recursive: true });
    skillIn(path.join(machine, "elsewhere"), "mine");
    fs.symlinkSync(path.join(machine, "elsewhere", "mine"), path.join(own, "mine"), "dir");

    linkHarnessSkills(own, record, {}, table);

    expect(links()).toEqual({ mine: path.join(machine, "elsewhere", "mine") });
  });

  it("removes the links of a harness whose plugin is no longer mounted", () => {
    linkHarnessSkills(own, record, { claude: true, codex: true }, table);

    linkHarnessSkills(own, record, {}, table.filter((one) => one.name === "claude"));

    expect(links()).toEqual({});
  });

  it("is a no-op for a harness set to true that has no skills directory", () => {
    fs.rmSync(path.join(machine, ".codex"), { recursive: true });

    expect(() => linkHarnessSkills(own, record, { codex: true }, table)).not.toThrow();
    expect(links()).toEqual({});
  });

  it("leaves every link as it is when harnessSkills is not a mapping", () => {
    linkHarnessSkills(own, record, { claude: true }, table);

    expect(() => linkHarnessSkills(own, record, true, table)).toThrow(/harnessSkills.*mapping/);
    expect(() => linkHarnessSkills(own, record, ["claude"], table)).toThrow(/harnessSkills.*mapping/);
    expect(Object.keys(links())).toEqual(["northwind-code-review"]);
  });

  it("makes no link it could not record, so false can always remove what amy made", () => {
    // The record cannot be written: a directory sits where the file goes.
    fs.mkdirSync(record, { recursive: true });

    expect(() => linkHarnessSkills(own, record, { claude: true }, table)).toThrow();
    expect(links()).toEqual({});

    fs.rmSync(record, { recursive: true });
    linkHarnessSkills(own, record, { claude: true }, table);
    linkHarnessSkills(own, record, { claude: false }, table);
    expect(links()).toEqual({});
  });

  it("links from the harnesses a chat recovered without the workflow, so the setting holds there too", async () => {
    const cli = { name: "claude", skillsDirectory: path.join(machine, ".claude", "skills"), ask: async () => ({ text: "", run: { outcome: "completed" } }) } as unknown as Harness;
    const claude: Plugin = { name: "@amykit/plugin-claude", register: (registry) => registry.contribute(HARNESS_COLLECTION, "claude:sonnet", { name: "claude:sonnet", harness: "claude", model: "sonnet", cli }) };
    const broken: Plugin = { name: "@amykit/plugin-broken", register: () => { throw new Error("will not mount"); } };
    const host = { runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) }, now: () => new Date(), paths: { state: path.join(machine, ".amy") } };

    const parts = await recoverChatParts([broken, claude], {}, host);
    linkHarnessSkills(own, record, { claude: true }, linkableHarnesses(parts));

    expect(Object.keys(links())).toEqual(["northwind-code-review"]);
  });

  it("writes a shipped skill over a link of the same name without touching the harness's copy", () => {
    linkHarnessSkills(own, record, { claude: true }, table);

    install(own, [["northwind-code-review", "# amy ships one now\n"]]);

    expect(fs.lstatSync(path.join(own, "northwind-code-review")).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(machine, ".claude", "skills", "northwind-code-review", "SKILL.md"), "utf-8")).toBe("# northwind-code-review\n");
  });
});
