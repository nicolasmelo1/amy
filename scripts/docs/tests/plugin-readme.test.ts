import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isMounted, type Facts, type MountedFact } from "../lib/facts.js";
import { ROOT } from "../lib/repo.js";
import { missingAbout, readmesFrom } from "../render/readme.js";
import { packageFacts } from "../sources/packages.js";

let packages: Awaited<ReturnType<typeof packageFacts>>;
let plugins: MountedFact[];

beforeAll(async () => {
  packages = await packageFacts();
  plugins = packages.filter(isMounted).filter((entry) => entry.group === "plugins");
}, 120_000);

/** A plugin README is generated whole: what it extends is read from the package, and when to use it is its amy.about. */
describe("a plugin's README", () => {
  it("lists what its package registers and its amy.about", () => {
    expect(plugins.length).toBeGreaterThan(0);

    for (const entry of plugins) {
      const readme = fs.readFileSync(path.join(ROOT, entry.directory, "README.md"), "utf8");
      const named = [
        ...entry.mounts,
        ...entry.addsActions.map((action) => action.name),
        ...(entry.brings?.operations ?? []),
        ...(entry.brings?.commands ?? []).map((command) => `amy ${command.name}`),
        ...(entry.brings?.events ?? []),
        ...entry.environment,
      ];

      expect(entry.about, `${entry.name} has an amy.about`).toBeTruthy();
      expect(readme, entry.name).toContain(entry.about!.trim());
      expect(readme, entry.name).toContain("## What it extends");
      for (const name of named) expect(readme, `${entry.name} names ${name}`).toContain(`\`${name}\``);
    }
  });

  it("is written from the package, so a README somebody edits is stale", () => {
    const written = new Map(readmesFrom({ packages } as Facts).map((one) => [one.file, one.text]));
    for (const entry of plugins) {
      expect(fs.readFileSync(path.join(ROOT, entry.directory, "README.md"), "utf8")).toBe(written.get(`${entry.directory}/README.md`));
    }
  });

  it("fails the check naming the plugin when its amy.about is removed", () => {
    const [first] = plugins;
    const without = packages.map((entry) => (entry === first ? { ...entry, about: undefined } : entry));

    expect(missingAbout({ packages } as Facts)).toEqual([]);
    expect(missingAbout({ packages: without } as Facts)).toEqual([expect.stringContaining(first!.name)]);
  });
});
