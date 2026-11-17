import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ONE_WAY = "packages/core/src/atomic-file.ts";

/** Every source file under packages, plugins and examples `src`, without build output or dependencies. */
function sources(): string[] {
  const walk = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : walk(full);
      return /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [full] : [];
    });
  return ["packages", "plugins", "examples"].flatMap((top) =>
    fs
      .readdirSync(path.join(ROOT, top), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, top, entry.name, "src")))
      .flatMap((entry) => walk(path.join(ROOT, top, entry.name, "src"))),
  );
}

describe("a file staged before it replaces another", () => {
  it("is staged only by core's atomic write, never under a .tmp name built by hand", () => {
    const handMade = sources()
      .filter((file) => path.relative(ROOT, file) !== ONE_WAY)
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf-8")
          .split("\n")
          .map((line, index) => ({ line, at: `${path.relative(ROOT, file)}:${index + 1}` }))
          .filter(({ line }) => /\.tmp[`"']/.test(line) && !/^\s*(\/\/|\*)/.test(line))
          .map(({ at }) => at),
      );

    expect(handMade).toEqual([]);
  });
});
