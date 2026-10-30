import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skill = fs.readFileSync(path.join(import.meta.dirname, "..", "skills", "amy-workflow", "SKILL.md"), "utf-8");

describe("/amy-workflow", () => {
  it("starts a workflow as a directory, and names publishing as a later choice", () => {
    const directory = skill.indexOf("directory under `~/.amy/workflows`");
    const publishing = skill.search(/publish/i);

    expect(directory).toBeGreaterThan(-1);
    expect(publishing).toBeGreaterThan(directory);
    expect(skill).toMatch(/Publishing it as a package is a later choice/);
  });
});
