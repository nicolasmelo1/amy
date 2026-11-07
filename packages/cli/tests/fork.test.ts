import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFork } from "../src/add.js";
import { FORK_RECORD, ForkRecord, profileForkDirectories, readRootManifest } from "../src/fork.js";
import { pluginsRootResolver } from "../src/loader.js";
import { profileForks, profileRoot } from "../src/paths.js";
import { Profile } from "../src/profiles.js";
import { dropFork } from "../src/remove.js";
import { ForkWorld, Upstream, installed } from "./fork-world.js";

const PAGER = "@acme/plugin-pager";

/** A profile driving a workflow somebody else published, so its forks live under AMY_HOME. */
const PAGING: Profile = {
  name: "paging",
  workflow: "@acme/workflow-paging",
  plugins: [],
  takesNotes: false,
  takesTasks: false,
  settings: {},
};

function pagerSource(version: string, said: string): Record<string, string | null> {
  return {
    "plugins/pager/package.json": JSON.stringify({
      name: PAGER,
      version,
      type: "module",
      main: "./index.js",
      repository: { type: "git", url: "set by the test", directory: "plugins/pager" },
    }, null, 2),
    "plugins/pager/index.js": `export const plugin = { name: "${PAGER}", said: "${said}", register() {} };\n`,
  };
}

describe("amy add --fork", () => {
  let home: string;
  let upstream: Upstream;
  let plugins: string;

  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-")));
    plugins = path.join(home, "plugins");
    upstream = new Upstream(path.join(home, "upstream"));
    upstream.release(pagerSource("1.0.0", "1.0.0 as released"), `${PAGER}@1.0.0`);
    upstream.release(pagerSource("1.1.0", "1.1.0 as released"), `${PAGER}@1.1.0`);
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const installPublished = (version: string, repository: unknown = { type: "git", url: upstream.url, directory: "plugins/pager" }) =>
    installed(plugins, { name: PAGER, version, type: "module", main: "./index.js", repository }, {
      "index.js": `export const plugin = { name: "${PAGER}", said: "published", register() {} };\n`,
    });

  const fork = (world: ForkWorld, spec: string = PAGER) =>
    addFork({ runner: world, home, profile: PAGING, specs: [PAGER], spec, cwd: home });

  it("fetches the directory the repository field names at the installed version's tag, records its base, and the profile mounts it", async () => {
    installPublished("1.0.0");
    const world = new ForkWorld();

    const forked = await fork(world);

    expect(forked.directory).toBe(path.join(profileForks(home, "paging"), "plugin-pager"));
    expect(fs.readFileSync(path.join(forked.directory, "index.js"), "utf-8")).toContain("1.0.0 as released");
    const record = JSON.parse(fs.readFileSync(path.join(forked.directory, FORK_RECORD), "utf-8")) as ForkRecord;
    expect(record.base).toMatchObject({ package: PAGER, version: "1.0.0", url: upstream.url.replace(/^git\+/, ""), directory: "plugins/pager", ref: `${PAGER}@1.0.0` });
    expect(record.base.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(readRootManifest(home, "paging")).toEqual({
      name: "amy-profile-paging",
      private: true,
      dependencies: { [PAGER]: `file:${forked.directory}` },
      overrides: { [PAGER]: `$${PAGER}` },
    });

    const mounted = (await import(pluginsRootResolver(home, plugins, "paging")(PAGER))) as { plugin: { said: string } };
    expect(mounted.plugin.said).toBe("1.0.0 as released");
    const elsewhere = (await import(pluginsRootResolver(home, plugins)(PAGER))) as { plugin: { said: string } };
    expect(elsewhere.plugin.said).toBe("published");
  });

  it("forks a git URL naming a repository directory the same way, with no registry asked", async () => {
    const world = new ForkWorld();

    const forked = await fork(world, `${upstream.url}#${PAGER}@1.1.0&path:plugins/pager`);

    expect(forked.name).toBe(PAGER);
    expect(fs.readFileSync(path.join(forked.directory, "index.js"), "utf-8")).toContain("1.1.0 as released");
    expect(forked.record.base).toMatchObject({ version: "1.1.0", directory: "plugins/pager", ref: `${PAGER}@1.1.0` });
    expect(world.calls.filter((call) => call.command === "npm" && call.args[0] !== "install")).toEqual([]);
    expect(world.calls.some((call) => call.command === "npm" && call.args.includes(plugins))).toBe(false);
  });

  it("refuses a package with no repository field before anything is written, naming the field and what was asked", async () => {
    installPublished("1.0.0", "");
    const world = new ForkWorld();

    await expect(fork(world)).rejects.toThrow(`${PAGER}@1.0.0 declares no \`repository\` in its package.json, so there is no source to fork it from (asked: ${PAGER})`);
    expect(fs.existsSync(profileForks(home, "paging"))).toBe(false);
    expect(fs.existsSync(profileRoot(home, "paging"))).toBe(false);
  });

  it("refuses a tag that does not exist before anything is written, naming the tag and the URL", async () => {
    installPublished("2.0.0");
    const world = new ForkWorld();

    await expect(fork(world)).rejects.toThrow(`the tag ${PAGER}@2.0.0 does not exist at ${upstream.url.replace(/^git\+/, "")} (asked: ${PAGER})`);
    expect(fs.existsSync(profileForks(home, "paging"))).toBe(false);
    expect(fs.existsSync(profileRoot(home, "paging"))).toBe(false);
  });

  it("refuses a second fork of one package in one profile, naming both places", async () => {
    installPublished("1.0.0");
    const world = new ForkWorld();
    const first = await fork(world);

    await expect(addFork({ runner: world, home, profile: PAGING, specs: [PAGER], spec: PAGER, cwd: home, to: path.join(home, "elsewhere") }))
      .rejects.toThrow(`the profile \`paging\` already forks ${PAGER} at ${first.directory}; a second fork at ${path.join(home, "elsewhere", "plugin-pager")}`);
  });

  it("refuses to fork the core, which every profile resolves from amy's own install", async () => {
    await expect(fork(new ForkWorld(), "@amykit/core")).rejects.toThrow("@amykit/core is not forked");
  });

  it("drops a removed fork from the profile root and keeps its directory", async () => {
    installPublished("1.0.0");
    const world = new ForkWorld();
    const forked = await fork(world);
    fs.appendFileSync(path.join(forked.directory, "index.js"), "// mine\n");

    const dropped = await dropFork(world, home, "paging", PAGER, [PAGER]);

    expect(dropped).toEqual({ ok: true, directory: forked.directory });
    expect(profileForkDirectories(home, "paging").size).toBe(0);
    expect(fs.existsSync(profileRoot(home, "paging"))).toBe(false);
    expect(fs.readFileSync(path.join(forked.directory, "index.js"), "utf-8")).toContain("// mine");
  });

  it("drops the workspace's private packages from what a fork installs, keeping what compiles it", async () => {
    const workspace = new Upstream(path.join(home, "workspace"));
    workspace.release({
      "package.json": JSON.stringify({ name: "acme", private: true, devDependencies: { typescript: "^5.8.3" } }),
      "tsconfig.base.json": JSON.stringify({ compilerOptions: { strict: true, composite: true } }),
      "packages/fixtures/package.json": JSON.stringify({ name: "@acme/test-fixtures", private: true }),
      "plugins/pager/package.json": JSON.stringify({
        name: PAGER, version: "1.0.0", type: "module", main: "./dist/index.js",
        dependencies: { "@amykit/core": "^0.6.0" },
        devDependencies: { "@acme/test-fixtures": "^0.1.0" },
      }),
      "plugins/pager/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { outDir: "dist" }, references: [{ path: "../../packages/fixtures" }] }),
      "plugins/pager/src/index.ts": "export const said = 1;\n",
    }, `${PAGER}@1.0.0`);
    const world = new ForkWorld();
    const built: string[] = [];
    const recording = { run: async (command: string, args: readonly string[], options?: { cwd?: string }) => {
      if (command === "npm" && args[0] === "run") {
        built.push(options!.cwd!);
        return { ok: true, exitCode: 0, stdout: "", stderr: "" };
      }
      return world.run(command, args, options);
    } };

    const forked = await addFork({ runner: recording, home, profile: PAGING, specs: [PAGER], spec: `${workspace.url}#${PAGER}@1.0.0&path:plugins/pager`, cwd: home });

    const manifest = JSON.parse(fs.readFileSync(path.join(forked.directory, "package.json"), "utf-8")) as { dependencies: object; devDependencies: object; scripts: object };
    expect(manifest.devDependencies).toEqual({ typescript: "^5.8.3" });
    expect(manifest.dependencies).toEqual({ "@amykit/core": "^0.6.0" });
    expect(manifest.scripts).toEqual({ build: "tsc -p tsconfig.json" });
    expect(JSON.parse(fs.readFileSync(path.join(forked.directory, "tsconfig.json"), "utf-8"))).toEqual({ compilerOptions: { strict: true, outDir: "dist" } });
    expect(built).toEqual([forked.directory]);
  });
});
