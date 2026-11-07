import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFork } from "../src/add.js";
import { prepareForks } from "../src/fork.js";
import { profileRoot } from "../src/paths.js";
import { Profile } from "../src/profiles.js";
import { ForkWorld, Upstream } from "./fork-world.js";

const PAGER = "@acme/plugin-pager";
const PAGING: Profile = { name: "paging", workflow: "@acme/workflow-paging", plugins: [], takesNotes: false, takesTasks: false, settings: {} };

/** A package whose build copies its source into what it publishes, and counts every build it runs. */
function buildable(): Record<string, string> {
  return {
    "pager/package.json": JSON.stringify({
      name: PAGER, version: "1.0.0", type: "module", main: "./dist/index.js",
      scripts: { build: "mkdir -p dist && cp src/index.js dist/index.js && echo built >> builds.log" },
    }, null, 2),
    "pager/src/index.js": "export const said = \"as released\";\n",
  };
}

describe("a fork, before it mounts", () => {
  let home: string;
  let fork: string;
  let world: ForkWorld;
  const builds = () => fs.readFileSync(path.join(fork, "builds.log"), "utf-8").trim().split("\n").length;
  const copied = () => fs.readFileSync(path.join(profileRoot(home, "paging"), "node_modules", ...PAGER.split("/"), "dist", "index.js"), "utf-8");

  beforeEach(async () => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-build-")));
    const upstream = new Upstream(path.join(home, "upstream"));
    upstream.release(buildable(), `${PAGER}@1.0.0`);
    world = new ForkWorld();
    fork = (await addFork({ runner: world, home, profile: PAGING, specs: [PAGER], spec: `${upstream.url}#${PAGER}@1.0.0&path:pager`, cwd: home })).directory;
    fs.rmSync(path.join(fork, "builds.log"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const prepare = () => prepareForks(world, home, path.join(home, "plugins"), "paging", [PAGER]);

  it("is built when its source changed, and the profile mounts what it built", async () => {
    fs.writeFileSync(path.join(fork, "src", "index.js"), "export const said = \"edited\";\n");

    await expect(prepare()).resolves.toEqual({ ok: true });

    expect(builds()).toBe(1);
    expect(copied()).toContain("edited");
  });

  it("is not built again when its source did not change", async () => {
    fs.writeFileSync(path.join(fork, "src", "index.js"), "export const said = \"edited\";\n");
    await prepare();
    const installs = world.calls.filter((call) => call.args[0] === "install").length;

    await expect(prepare()).resolves.toEqual({ ok: true });

    expect(builds()).toBe(1);
    expect(world.calls.filter((call) => call.args[0] === "install").length).toBe(installs);
  });

  it("refuses the boot when its build fails, naming the fork and what the build said", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(fork, "package.json"), "utf-8")) as { scripts: Record<string, string> };
    manifest.scripts.build = "echo 'src/index.ts(3,1): error TS1005: expected' && exit 2";
    fs.writeFileSync(path.join(fork, "package.json"), JSON.stringify(manifest));

    const prepared = await prepare();

    expect(prepared.ok).toBe(false);
    expect(prepared.ok === false && prepared.problems[0]).toBe(`${PAGER}: the fork at ${fork} does not build:\nsrc/index.ts(3,1): error TS1005: expected\n`.trim());
  });
});
