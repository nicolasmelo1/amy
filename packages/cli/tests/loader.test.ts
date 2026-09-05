import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { NOT_INSTALLED, installedPlugins, load } from "../src/loader.js";
import { profiles, recommendedFor } from "../src/profiles.js";
import { pluginList } from "../src/slices.js";

const SHIPPED = Object.values(profiles(DEFAULT_CONFIG));

describe("load", () => {
  it("loads nothing from nothing", async () => {
    await expect(load([])).resolves.toEqual({ plugins: [], problems: [] });
  });

  it("takes the `plugin` export of a real package", async () => {
    const result = await load(["@amy/plugin-file-queue"]);

    expect(result.problems).toEqual([]);
    expect(result.plugins.map((p) => p.name)).toEqual(["@amy/plugin-file-queue"]);
  });

  it("says a spec is not installed, rather than throwing", async () => {
    const result = await load(["@amy/plugin-does-not-exist"]);

    expect(result.plugins).toEqual([]);
    expect(result.problems[0]).toContain("@amy/plugin-does-not-exist: not installed");
  });

  it("says so in the same words every time, so a caller can answer it", async () => {
    // The caller is what names the alternatives, once, rather than this
    // repeating the same list beside every missing plugin.
    const result = await load(["@amy/plugin-file-quue", "@amy/plugin-nope"]);

    expect(result.problems.every((problem) => problem.includes(NOT_INSTALLED))).toBe(true);
  });

  it("tells a plugin that is not there from one that threw", async () => {
    const result = await load(["@amy/test-fixtures"]);

    expect(result.problems[0]).not.toContain(NOT_INSTALLED);
  });

  it("names a package that imported but exports no plugin", async () => {
    // A library is not a plugin, and saying so beats a property access on
    // undefined three layers down.
    const result = await load(["@amy/test-fixtures"]);

    expect(result.problems[0]).toBe("@amy/test-fixtures: imported, but exports no `plugin`");
  });

  it("keeps loading past one that failed", async () => {
    const result = await load(["@amy/plugin-nope", "@amy/plugin-file-queue"]);

    expect(result.plugins).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
  });

  it("loads every plugin a shipped profile recommends", async () => {
    // If this breaks, a fresh install is broken, which is worth one test.
    for (const profile of SHIPPED) {
      const specs = recommendedFor(profile);
      const result = await load(specs);

      expect(result.problems).toEqual([]);
      expect(result.plugins).toHaveLength(specs.length);
    }
  });
});

describe("what this machine has", () => {
  it("reads the plugins off disk rather than off a list", () => {
    const found = installedPlugins();

    expect(found).toContain("@amy/plugin-serial-engine");
    expect(found).toContain("@amy/workflow-ticket-to-qa");
  });

  it("reports nothing about a directory that holds no node_modules", () => {
    expect(installedPlugins(new URL("file:///"))).toEqual([]);
  });

  it("has every plugin a shipped profile would mount", () => {
    // Opt-in means "not mounted", not "not installable": the gating happens
    // in `pluginList`, by whether the ladder names the harness.
    const found = installedPlugins();

    for (const profile of SHIPPED) {
      for (const spec of recommendedFor(profile)) expect(found).toContain(spec);
    }
    expect(pluginList(DEFAULT_CONFIG, SHIPPED[0]!).length).toBeLessThan(
      recommendedFor(SHIPPED[0]!).length,
    );
  });
});
