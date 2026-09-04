import { describe, it, expect } from "vitest";
import { COMPILED_IN, DEFAULT_PLUGINS, load } from "../src/loader.js";

describe("load", () => {
  it("loads nothing from nothing", async () => {
    await expect(load([])).resolves.toEqual({ plugins: [], problems: [] });
  });

  it("takes the `plugin` export of a real package", async () => {
    const result = await load(["@amy/plugin-file-queue"]);

    expect(result.problems).toEqual([]);
    expect(result.plugins.map((p) => p.name)).toEqual(["@amy/plugin-file-queue"]);
  });

  it("names a spec it could not import, rather than throwing", async () => {
    const result = await load(["@amy/plugin-does-not-exist"]);

    expect(result.plugins).toEqual([]);
    expect(result.problems[0]).toContain("@amy/plugin-does-not-exist: could not be imported");
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

  it("loads every plugin the built-in set names", async () => {
    // If this breaks, a fresh install is broken, which is worth one test.
    const result = await load(DEFAULT_PLUGINS);

    expect(result.problems).toEqual([]);
    expect(result.plugins).toHaveLength(DEFAULT_PLUGINS.length);
  });
});

describe("what the binary carries", () => {
  it("compiles in every plugin the default set names", () => {
    // The type system already refuses a default that is not in the table.
    // This is the runtime half: the table has to be the superset, or a
    // compiled binary would be asked for a plugin it does not contain.
    for (const spec of DEFAULT_PLUGINS) {
      expect(COMPILED_IN).toContain(spec);
    }
  });

  it("imports every one of them and finds a plugin, with nothing to resolve", () => {
    // A table entry that points at a package exporting no `plugin` is a
    // break that only appears once somebody runs the binary. This is that
    // check, minus the binary.
    return load(COMPILED_IN).then((result) => {
      expect(result.problems).toEqual([]);
      expect(result.plugins).toHaveLength(COMPILED_IN.length);
    });
  });

  it("carries the harnesses that are opt-in", () => {
    // Opt-in means "not mounted", not "not shipped": the gating happens in
    // `pluginList`, by whether the ladder names the harness. Naming codex in
    // a ladder has to work on a machine that installed nothing extra.
    expect(COMPILED_IN).toContain("@amy/plugin-codex");
    expect(COMPILED_IN).toContain("@amy/plugin-hermes-agent");
  });
});
