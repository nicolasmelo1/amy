import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFork } from "../src/add.js";
import { applyForkUpdates, markedMergePlace, mergeForks, readTree } from "../src/fork.js";
import { Profile } from "../src/profiles.js";
import { ForkWorld, Upstream, installed } from "./fork-world.js";

const PAGER = "@acme/plugin-pager";

const PAGING: Profile = { name: "paging", workflow: "@acme/workflow-paging", plugins: [], takesNotes: false, takesTasks: false, settings: {} };

function release(version: string, greeting: string, farewell: string): Record<string, string> {
  return {
    "pager/package.json": JSON.stringify({ name: PAGER, version, type: "module", main: "./index.js" }, null, 2),
    "pager/index.js": [
      `export const greeting = "${greeting}";`,
      "",
      "export function page(who) {",
      "  return `${greeting}, ${who}`;",
      "}",
      "",
      `export const farewell = "${farewell}";`,
      "",
    ].join("\n"),
    "pager/NOTES.md": `notes for ${version}\n`,
  };
}

describe("amy update with a fork", () => {
  let home: string;
  let upstream: Upstream;
  let fork: string;
  let world: ForkWorld;

  beforeEach(async () => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-update-")));
    upstream = new Upstream(path.join(home, "upstream"));
    upstream.release(release("1.0.0", "hello", "bye"), `${PAGER}@1.0.0`);
    installed(path.join(home, "plugins"), {
      name: PAGER, version: "1.0.0", type: "module", main: "./index.js",
      repository: { type: "git", url: upstream.url, directory: "pager" },
    }, { "index.js": "export const plugin = {};\n" });
    fs.writeFileSync(path.join(home, "plugins", "package.json"), JSON.stringify({ name: "amy-plugins", private: true, dependencies: { [PAGER]: "^1.0.0" } }));
    fs.writeFileSync(path.join(home, "config.yaml"), "workflows:\n  paging:\n    workflow: \"@acme/workflow-paging\"\n");
    world = new ForkWorld({ [`${PAGER}@^1.0.0`]: "1.1.0" });
    fork = (await addFork({ runner: world, home, profile: PAGING, specs: [PAGER], spec: PAGER, cwd: home })).directory;
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("keeps a person's edit and takes an upstream change to other lines", async () => {
    const edited = fs.readFileSync(path.join(fork, "index.js"), "utf-8").replace('"hello"', '"good morning"');
    fs.writeFileSync(path.join(fork, "index.js"), edited);
    upstream.release(release("1.1.0", "hello", "see you"), `${PAGER}@1.1.0`);

    const updates = await mergeForks(world, [{ name: PAGER, fork, version: "1.1.0" }]);
    applyForkUpdates(updates);

    const merged = fs.readFileSync(path.join(fork, "index.js"), "utf-8");
    expect(updates[0]!.merged.conflicts).toEqual([]);
    expect(merged).toContain('greeting = "good morning"');
    expect(merged).toContain('farewell = "see you"');
    expect(fs.readFileSync(path.join(fork, "NOTES.md"), "utf-8")).toBe("notes for 1.1.0\n");
    expect(JSON.parse(fs.readFileSync(path.join(fork, ".amy-fork.json"), "utf-8"))).toMatchObject({ base: { version: "1.1.0", ref: `${PAGER}@1.1.0` } });
  });

  it("follows a release that moved its package to another directory of the repository", async () => {
    // amy's shipped workflows moved from packages/ to examples/ between two
    // releases; a fork taken before the move recorded the old directory.
    fs.writeFileSync(path.join(fork, "index.js"), fs.readFileSync(path.join(fork, "index.js"), "utf-8").replace('"hello"', '"good morning"'));
    const moved = Object.fromEntries(Object.entries(release("1.1.0", "hello", "see you")).map(([file, content]) => [`examples/${file}`, content]));
    upstream.release({ ...moved, "pager/package.json": null, "pager/index.js": null, "pager/NOTES.md": null }, `${PAGER}@1.1.0`);

    const updates = await mergeForks(world, [{ name: PAGER, fork, version: "1.1.0" }]);
    applyForkUpdates(updates);

    const merged = fs.readFileSync(path.join(fork, "index.js"), "utf-8");
    expect(updates[0]!.merged.conflicts).toEqual([]);
    expect(merged).toContain('greeting = "good morning"');
    expect(merged).toContain('farewell = "see you"');
    expect(JSON.parse(fs.readFileSync(path.join(fork, ".amy-fork.json"), "utf-8"))).toMatchObject({
      base: { version: "1.1.0", ref: `${PAGER}@1.1.0`, directory: "examples/pager" },
    });

    // The next update reads its base from where the last one recorded it.
    upstream.release({ "examples/pager/NOTES.md": "notes for 1.2.0\n" }, `${PAGER}@1.2.0`);
    applyForkUpdates(await mergeForks(world, [{ name: PAGER, fork, version: "1.2.0" }]));
    expect(fs.readFileSync(path.join(fork, "NOTES.md"), "utf-8")).toBe("notes for 1.2.0\n");
    expect(fs.readFileSync(path.join(fork, "index.js"), "utf-8")).toContain('greeting = "good morning"');
  });

  it("refuses a release that holds no package of that name, naming it", async () => {
    upstream.release({ "pager/package.json": null, "pager/index.js": null, "pager/NOTES.md": null }, `${PAGER}@1.1.0`);

    await expect(mergeForks(world, [{ name: PAGER, fork, version: "1.1.0" }])).rejects.toThrow(`no package named ${PAGER}`);
  });

  it("stops the whole update on a line both changed, leaves the fork byte for byte, and writes the marked merge where it says", async () => {
    fs.writeFileSync(path.join(fork, "index.js"), fs.readFileSync(path.join(fork, "index.js"), "utf-8").replace('"hello"', '"good morning"'));
    upstream.release(release("1.1.0", "hi there", "see you"), `${PAGER}@1.1.0`);
    const before = readTree(fork);
    const said: string[] = [];
    const original = console.error;
    console.error = (...line: unknown[]) => said.push(line.join(" "));

    const { updateCommand } = await import("../src/index.js");
    let code: number;
    try {
      code = await updateCommand(home, world, undefined, false, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => [],
        installRoot: path.join(home, "no-install-root"),
      });
    } finally {
      console.error = original;
    }

    expect(code).toBe(1);
    expect(readTree(fork)).toEqual(before);
    const place = markedMergePlace(fork);
    expect(said.join("\n")).toContain(`${PAGER} 1.0.0 → 1.1.0: your fork and the new version changed the same lines in index.js; the marked merge is at ${place}`);
    const marked = fs.readFileSync(path.join(place, "index.js"), "utf-8");
    expect(marked).toContain(`<<<<<<< fork ${fork}\nexport const greeting = "good morning";\n||||||| ${PAGER}@1.0.0\nexport const greeting = "hello";\n=======\nexport const greeting = "hi there";\n>>>>>>> ${PAGER}@1.1.0`);
    expect(marked).toContain('farewell = "see you"');
    // Nothing moved: the machine's root was never asked to install.
    expect(world.calls.some((call) => call.command === "npm" && call.args[0] === "install" && call.args.includes(path.join(home, "plugins")))).toBe(false);
  });
});

/**
 * A workflow forked out of a TypeScript monorepo, the way the shipped ones are:
 * its tsconfig extends the repository's and references packages beside it.
 * The fork flattened that tsconfig and dropped the references; the next
 * release moved the package and its references with it, as PR #187 did.
 */
describe("amy update with a fork of a TypeScript workflow that moved", () => {
  const FLOW = "@acme/workflow-flow";
  let home: string;
  let upstream: Upstream;
  let fork: string;
  let world: ForkWorld;

  function workflow(directory: string, core: string, version: string, said: string): Record<string, string> {
    return {
      [`${directory}/package.json`]: JSON.stringify({ name: FLOW, version, type: "module", main: "./dist/index.js", repository: { type: "git", url: "x", directory } }, null, 2),
      [`${directory}/tsconfig.json`]: JSON.stringify({
        extends: "../../tsconfig.base.json",
        compilerOptions: { rootDir: "src", outDir: "dist" },
        include: ["src"],
        references: [{ path: core }],
      }, null, 2),
      [`${directory}/src/index.ts`]: `export const said = "${said}";\n\nexport const steps = ["one", "two"];\n`,
    };
  }

  beforeEach(async () => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-ts-")));
    upstream = new Upstream(path.join(home, "upstream"));
    upstream.release({
      "tsconfig.base.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", strict: true, composite: true } }, null, 2),
      "packages/core/package.json": JSON.stringify({ name: "@acme/core", version: "1.0.0" }),
      ...workflow("packages/workflow-flow", "../core", "1.0.0", "as released"),
    }, `${FLOW}@1.0.0`);
    world = new ForkWorld();
    fork = (await addFork({
      runner: world, home, profile: PAGING, specs: [FLOW], spec: `${upstream.url}#${FLOW}@1.0.0&path:packages/workflow-flow`, cwd: home,
    })).directory;
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  function moveTo(version: string, said: string): void {
    upstream.release({
      "packages/workflow-flow/package.json": null,
      "packages/workflow-flow/tsconfig.json": null,
      "packages/workflow-flow/src/index.ts": null,
      ...workflow("examples/workflow-flow", "../../packages/core", version, said),
    }, `${FLOW}@${version}`);
  }

  it("takes a release that changed only its references, with no conflict, when nobody edited the fork", async () => {
    const tsconfig = fs.readFileSync(path.join(fork, "tsconfig.json"), "utf-8");
    moveTo("1.1.0", "as released");

    const updates = await mergeForks(world, [{ name: FLOW, fork, version: "1.1.0" }]);

    expect(updates[0]!.merged.conflicts).toEqual([]);
    applyForkUpdates(updates);
    expect(fs.readFileSync(path.join(fork, "tsconfig.json"), "utf-8")).toBe(tsconfig);
    expect(JSON.parse(tsconfig)).not.toHaveProperty("references");
    expect(JSON.parse(fs.readFileSync(path.join(fork, ".amy-fork.json"), "utf-8"))).toMatchObject({ base: { directory: "examples/workflow-flow" } });
  });

  it("keeps a person's edit to the source and takes the release's, across the move", async () => {
    fs.writeFileSync(path.join(fork, "src", "index.ts"), fs.readFileSync(path.join(fork, "src", "index.ts"), "utf-8").replace('"two"', '"two", "three"'));
    moveTo("1.1.0", "moved");

    const updates = await mergeForks(world, [{ name: FLOW, fork, version: "1.1.0" }]);
    applyForkUpdates(updates);

    expect(updates[0]!.merged.conflicts).toEqual([]);
    const source = fs.readFileSync(path.join(fork, "src", "index.ts"), "utf-8");
    expect(source).toContain('said = "moved"');
    expect(source).toContain('"two", "three"');
  });
});
