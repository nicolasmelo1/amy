import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandResult, RunOptions } from "@amykit/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFork } from "../src/add.js";
import { pluginsRootResolver } from "../src/loader.js";
import { profileRoot } from "../src/paths.js";
import { Profile } from "../src/profiles.js";
import { ForkWorld, Upstream, installed } from "./fork-world.js";

const PAGER = "@acme/plugin-pager";
const PAGING = "@acme/workflow-paging";

/** npm as it really lays a root out: every package it installs brings a core of its own, at the top and nested. */
class NpmBringsACore extends ForkWorld {
  override async run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    const result = await super.run(command, args, options);
    if (command === "npm" && args[0] === "install" && args[1] === "--prefix") {
      const modules = path.join(args[2]!, "node_modules");
      for (const at of [modules, path.join(modules, ...PAGING.split("/"), "node_modules")]) {
        installed(path.dirname(at), { name: "@amykit/core", version: "0.0.0-copy", type: "module", main: "./index.js" }, {
          "index.js": "export const identity = { copy: true };\n",
        });
      }
    }
    return result;
  }
}

function profile(name: string): Profile {
  return { name, workflow: PAGING, plugins: [PAGING, PAGER], takesNotes: false, takesTasks: false, settings: {} };
}

describe("a profile root", () => {
  let home: string;
  let plugins: string;

  beforeEach(async () => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "amy-profile-root-")));
    plugins = path.join(home, "plugins");
    const upstream = new Upstream(path.join(home, "upstream"));
    const pager = (said: string) => `import { identity } from "@amykit/core";\nexport const plugin = { name: "${PAGER}", said: "${said}", core: identity, register() {} };\n`;
    const manifest = { name: PAGER, version: "1.0.0", type: "module", main: "./index.js", dependencies: { "@amykit/core": "^0.6.0" }, repository: { type: "git", url: upstream.url, directory: "pager" } };
    upstream.release({ "pager/package.json": JSON.stringify(manifest), "pager/index.js": pager("the fork") }, `${PAGER}@1.0.0`);

    installed(plugins, { name: "@amykit/core", version: "0.6.0", type: "module", main: "./index.js" }, { "index.js": "export const identity = { host: true };\n" });
    installed(plugins, manifest, { "index.js": pager("published") });
    installed(plugins, { name: PAGING, version: "1.0.0", type: "module", main: "./index.js", dependencies: { "@amykit/core": "^0.6.0", [PAGER]: "^1.0.0" } }, {
      // A workflow that imports the plugin itself, by name: the fork has to reach it here too.
      "index.js": `import { plugin as pager } from "${PAGER}";\nimport { identity } from "@amykit/core";\nexport const plugin = { name: "${PAGING}", pager, core: identity, register() {} };\n`,
    });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  type Paging = { plugin: { pager: { said: string; core: object }; core: object } };
  const mount = async (name?: string) => (await import(pluginsRootResolver(home, plugins, name)(PAGING))) as Paging;

  it("lets two profiles mount one package name, one published and one forked, each resolving its own", async () => {
    const forked = profile("forked");
    await addFork({ runner: new NpmBringsACore(), home, profile: forked, specs: forked.plugins, spec: PAGER, cwd: home });

    const published = await mount("published");
    const own = await mount("forked");

    expect(published.plugin.pager.said).toBe("published");
    expect(own.plugin.pager.said).toBe("the fork");
    // Both profiles name the package, never where it lives.
    expect(profile("published").plugins).toEqual(forked.plugins);
    expect(fs.readFileSync(path.join(profileRoot(home, "forked"), "node_modules", ...PAGER.split("/"), "index.js"), "utf-8")).not.toMatch(/from "[./]/);
  });

  it("holds no core: the workflow and the fork it mounts both see the machine's one copy", async () => {
    const forked = profile("forked");
    await addFork({ runner: new NpmBringsACore(), home, profile: forked, specs: forked.plugins, spec: PAGER, cwd: home });

    const own = await mount("forked");
    const host = (await import(pluginsRootResolver(home, plugins)("@amykit/core"))) as { identity: object };

    const cores = (fs.readdirSync(profileRoot(home, "forked"), { recursive: true }) as string[]).filter((file) => file.endsWith(path.join("@amykit", "core")));
    expect(cores).toEqual([]);
    expect(own.plugin.core).toBe(host.identity);
    expect(own.plugin.pager.core).toBe(host.identity);
  });
});
