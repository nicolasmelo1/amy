import { describe, it, expect } from "vitest";
import fc from "fast-check";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { loadConfig } from "../src/config.js";
import { paths } from "../src/paths.js";

/** The falsifier this property must reject, planted only when the rule names it. */
const FALSIFIER = "a_nested_key_is_dropped";
const dropped = process.env.SF_FALSIFIER === FALSIFIER;

/** The one slice the property reads, named as an install names it. */
const PLUGIN = "@amykit/plugin-example";

/**
 * A word a mapping can carry as a key.
 *
 * Drawn from a small pool on purpose: the property is about the same path
 * having a value on both sides, and a wide key space would make that overlap
 * so rare that the generator never reached the case.
 */
const word = fc.constantFrom("alpha", "beta", "gamma", "delta", "epsilon");

/** A value an operator writes in a YAML mapping. */
const value: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.stringMatching(/[a-z]{2,8}/),
  fc.boolean(),
  fc.array(fc.integer(), { maxLength: 3 }),
  fc.dictionary(word, fc.integer(), { maxKeys: 3 }),
);

const mapping = fc.dictionary(word, value, { maxKeys: 4 });

/** The merge the profile file is defined to get: mappings key by key, the rest whole. */
function deep(general: Record<string, unknown>, own: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...general };
  for (const [key, given] of Object.entries(own)) {
    const carried = merged[key];
    const bothMappings = typeof carried === "object" && carried !== null && !Array.isArray(carried)
      && typeof given === "object" && given !== null && !Array.isArray(given);
    merged[key] = bothMappings
      ? deep(carried as Record<string, unknown>, given as Record<string, unknown>)
      : given;
  }
  return merged;
}

describe("a profile's config is the machine's with the profile's over it", () => {
  it("lets every path the profile sets read the profile's value, and every other path the machine's (A2)", () => {
    const property = fc.property(mapping, mapping, (general, own) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-config-layers-"));

      try {
        fs.mkdirSync(path.join(paths(root).base, "profiles", "work"), { recursive: true });
        fs.writeFileSync(paths(root).config, yaml.stringify({ plugins: { [PLUGIN]: general } }));
        fs.writeFileSync(
          path.join(paths(root).base, "profiles", "work", "config.yaml"),
          yaml.stringify({ plugins: { [PLUGIN]: own } }),
        );

        // The mutation is a merge that keeps the top level and drops what is
        // nested inside it — the shape a reader that spread two mappings would
        // have. It reads the same general and profile documents, so a property
        // that passes under it never reached a key both sides carry.
        const read = dropped
          ? ({ ...general, ...own } as Record<string, unknown>)
          : loadConfig(root, "work").plugins[PLUGIN];

        expect(read).toEqual(deep(general, own));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    fc.assert(property, { numRuns: 200 });
  });
});
