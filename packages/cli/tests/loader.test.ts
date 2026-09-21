import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NOT_INSTALLED, installedPlugins, load, pluginsRootResolver } from "../src/loader.js";
import { Profile, recommendedFor } from "../src/profiles.js";

/**
 * A workflow declared the way a config declares one.
 *
 * Shipped profiles no longer exist — nothing is installed by default — so
 * what is checked here is the set one declared profile recommends, which is
 * the same claim at the only place it can still be made.
 */
const TICKETS: Profile = {
  name: "tickets",
  workflow: "@amykit/workflow-ticket-to-qa",
  plugins: [],
  takesNotes: false,
  takesTasks: false,
};

describe("load", () => {
  it("loads nothing from nothing", async () => {
    await expect(load([])).resolves.toEqual({ plugins: [], problems: [], bySpec: new Map() });
  });

  // The spec is not the plugin's own name whenever a resolver is in play: a
  // workflow of your own is asked for as `oncall` and calls itself
  // `workflow-oncall`. A caller matching the two reported what it had just
  // loaded as missing, which is what `amy plugin list` did.
  it("answers what each spec loaded, under the spec that asked", async () => {
    const result = await load(["queue"], () => "@amykit/plugin-file-queue");

    expect(result.bySpec.get("queue")?.name).toBe("@amykit/plugin-file-queue");
    expect(result.problems).toEqual([]);
  });

  it("keeps a spec that failed out of the answer", async () => {
    const result = await load(["@acme/plugin-nobody-installed"]);

    expect(result.bySpec.size).toBe(0);
    expect(result.problems).toHaveLength(1);
  });

  it("takes the `plugin` export of a real package", async () => {
    const result = await load(["@amykit/plugin-file-queue"]);

    expect(result.problems).toEqual([]);
    expect(result.plugins.map((p) => p.name)).toEqual(["@amykit/plugin-file-queue"]);
  });

  it("says a spec is not installed, rather than throwing", async () => {
    const result = await load(["@amykit/plugin-does-not-exist"]);

    expect(result.plugins).toEqual([]);
    expect(result.problems[0]).toContain("@amykit/plugin-does-not-exist: not installed");
  });

  it("says so in the same words every time, so a caller can answer it", async () => {
    // The caller is what names the alternatives, once, rather than this
    // repeating the same list beside every missing plugin.
    const result = await load(["@amykit/plugin-file-quue", "@amykit/plugin-nope"]);

    expect(result.problems.every((problem) => problem.includes(NOT_INSTALLED))).toBe(true);
  });

  it("tells a plugin that is not there from one that threw", async () => {
    const result = await load(["@amykit/test-fixtures"]);

    expect(result.problems[0]).not.toContain(NOT_INSTALLED);
  });

  it("names a package that imported but exports no plugin", async () => {
    // A library is not a plugin, and saying so beats a property access on
    // undefined three layers down.
    const result = await load(["@amykit/test-fixtures"]);

    expect(result.problems[0]).toBe("@amykit/test-fixtures: imported, but exports no `plugin`");
  });

  it("keeps loading past one that failed", async () => {
    const result = await load(["@amykit/plugin-nope", "@amykit/plugin-file-queue"]);

    expect(result.plugins).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
  });

  it("loads every plugin a declared profile recommends", async () => {
    // If this breaks, a declared install is broken, which is worth one test.
    const specs = recommendedFor(TICKETS);
    const result = await load(specs);

    expect(result.problems).toEqual([]);
    expect(result.plugins).toHaveLength(specs.length);
  });
});

describe("what this machine has", () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-loader-home-"));
    root = path.join(home, "plugins");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  function packageAt(
    name: string,
    source = 'export const plugin = { name: "@acme/plugin-oncall", version: "1.0.0", register() {} };\n',
    manifest: object = { name, type: "module", exports: "./index.js" },
  ): string {
    const directory = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(manifest)}\n`, "utf-8");
    fs.writeFileSync(path.join(directory, "index.js"), source, "utf-8");
    return directory;
  }

  it("resolves a plugin from amy's own root, not from the command's parents", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt("@acme/plugin-oncall");

    const loaded = await load(
      ["@acme/plugin-oncall"],
      pluginsRootResolver(home, root),
      root,
    );

    expect(loaded.problems).toEqual([]);
    expect(loaded.plugins.map((plugin) => plugin.name)).toEqual(["@acme/plugin-oncall"]);
  });

  it("resolves an import-only exports arm from the same root", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt(
      "@acme/plugin-import-only",
      'export const plugin = { name: "@acme/plugin-import-only", version: "1.0.0", register() {} };\n',
      { name: "@acme/plugin-import-only", type: "module", exports: { ".": { import: "./index.js" } } },
    );

    const loaded = await load(
      ["@acme/plugin-import-only"],
      pluginsRootResolver(home, root),
      root,
    );

    expect(loaded.problems).toEqual([]);
    expect(loaded.plugins.map((plugin) => plugin.name)).toEqual(["@acme/plugin-import-only"]);
  });

  it("reads the listing from that one root, rather than a parent walk", () => {
    packageAt("@acme/plugin-oncall");
    packageAt("@acme/not-a-plugin");

    expect(installedPlugins(root)).toEqual(["@acme/plugin-oncall"]);
  });

  it("reports nothing about a root that holds no node_modules", () => {
    expect(installedPlugins(root)).toEqual([]);
  });

  it("keeps a spec that is already a path unchanged", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-loader-path-"));
    const entry = path.join(directory, "index.js");
    fs.writeFileSync(entry, 'export const plugin = { name: "@acme/plugin-path", version: "1.0.0", register() {} };\n', "utf-8");
    try {
      const spec = pathToFileURL(entry).href;
      const loaded = await load([spec], pluginsRootResolver(home, root), root);

      expect(loaded.problems).toEqual([]);
      expect(loaded.bySpec.get(spec)?.name).toBe("@acme/plugin-path");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
