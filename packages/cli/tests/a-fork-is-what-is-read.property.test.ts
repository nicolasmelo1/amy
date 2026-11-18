import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pluginsRootResolver } from "../src/loader.js";

const FALSIFIER = "a_resolver_without_its_profile";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/**
 * The mutation the property must reject: the resolver `config explain`,
 * `workflow check` and `workflow export` built, reading the published package
 * while a fork of the same name sat in the profile.
 */
const resolverFor = (home: string, plugins: string, profile: string) =>
  planted ? pluginsRootResolver(home, plugins, "") : pluginsRootResolver(home, plugins, profile);

/** A home with a fork of `name` in its profile, and a published copy beside it. */
function homeWith(name: string): { home: string; plugins: string; profile: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-read-"));
  const plugins = path.join(home, "plugins");
  const profile = "probe";
  const own = path.join(plugins, "profiles", profile);

  fs.mkdirSync(own, { recursive: true });
  fs.writeFileSync(path.join(own, "package.json"), JSON.stringify({ dependencies: { [name]: "file:./forks/one" } }), "utf-8");

  for (const root of [own, plugins]) {
    const directory = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name, main: "index.js" }), "utf-8");
    fs.writeFileSync(path.join(directory, "index.js"), "export const plugin = {};\n", "utf-8");
  }
  return { home, plugins, profile };
}

/** The call's arguments, counted past the parentheses a nested call carries. */
function argumentCount(call: string): number {
  let depth = 0;
  let count = 1;
  for (const character of call.slice("pluginsRootResolver(".length)) {
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (character === "," && depth === 0) count += 1;
  }
  return count;
}

/** Every source file under a directory, without a build output or a dependency. */
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" || entry.name === "node_modules" ? [] : sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("a resolver", () => {
  it("a_resolver_without_its_profile", () => {
    const packageName = fc
      .tuple(
        fc.constantFrom("acme", "labs", "studio"),
        fc.constantFrom("tracker", "notes", "relay", "gate", "queue"),
      )
      .map(([scope, name]) => `@${scope}/${name}`);

    fc.assert(
      fc.property(packageName, (name) => {
        const { home, plugins, profile } = homeWith(name);
        const resolved = resolverFor(home, plugins, profile)(name);

        // The fork the profile holds, never the published package beside it.
        expect(resolved).toContain(path.join("plugins", "profiles", profile));
      }),
      { numRuns: 10 },
    );
  });

  it("every resolver under packages/cli/src knows its profile", () => {
    const root = path.join(process.cwd(), "packages/cli/src");
    const guilty = sources(root).flatMap((file) => {
      const text = fs.readFileSync(file, "utf-8");
      return [...text.matchAll(/pluginsRootResolver\([^;]*?\)\s*[,)\n;]/g)]
        .filter((match) => argumentCount(match[0]) < 3)
        .map((match) => `${path.relative(process.cwd(), file)}: ${match[0].split("\n")[0]!.trim()}`);
    });

    // The definition carries three parameters and is not a call; every other
    // occurrence names the profile it acts for.
    expect(guilty.filter((one) => !one.includes("export function"))).toEqual([]);
  });
});
