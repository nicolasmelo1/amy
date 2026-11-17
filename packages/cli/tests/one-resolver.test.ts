import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "packages/cli/src");

function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Every place under packages/cli/src that calls the resolver, not counting its own declaration. */
function callSites(): string[] {
  return sources(SRC).flatMap((file) =>
    fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .map((line, index) => ({ line, at: `${path.relative(process.cwd(), file)}:${index + 1}` }))
      .filter(({ line }) => /\bpluginsRootResolver\(/.test(line) && !/function pluginsRootResolver\(/.test(line))
      .map(({ at }) => at),
  );
}

describe("the plugin resolver", () => {
  it("is built in one place under the command line, which every command goes through", () => {
    expect(callSites()).toHaveLength(1);
  });

  it("cannot be built without the profile it acts for", () => {
    const loader = fs.readFileSync(path.join(SRC, "loader.ts"), "utf-8");
    const declaration = /export function pluginsRootResolver\(([^)]*)\)/.exec(loader)?.[1] ?? "";

    expect(declaration).toMatch(/\bprofile\s*:/);
    expect(declaration).not.toMatch(/\bprofile\s*\?\s*:/);
  });
});
