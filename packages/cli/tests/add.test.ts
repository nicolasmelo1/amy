import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  importPluginBySpec,
  uninstallFromPluginsRoot,
  unmetAction,
  whatBoots,
  whatMountingSays,
  whatPackageIs,
  withoutSpec,
} from "../src/add.js";
import { DEFAULT_CONFIG, loadConfig, removeExtraPlugin, writeExtraPlugins, writeWorkflowProfile } from "../src/config.js";
import { load, pluginsRootResolver } from "../src/loader.js";
import { Profile } from "../src/profiles.js";
import { pluginList } from "../src/slices.js";

/**
 * A third-party package on disk, built the way `npm pack` lays one out.
 *
 * The tests answer installs by hand: the unit under test is the decision and
 * the config it writes, not npm, and the real npm calls belong to the gate
 * scenario where the whole command is driven.
 */
function packageAt(
  root: string,
  name: string,
  source: string,
  manifest: Record<string, unknown> = { name, type: "module", exports: "./index.js" },
): string {
  const directory = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(manifest)}\n`, "utf-8");
  fs.writeFileSync(path.join(directory, "index.js"), source, "utf-8");
  return directory;
}

describe("whatPackageIs", () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-"));
    root = path.join(home, "plugins");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("answers a registry name with itself", () => {
    expect(whatPackageIs("@acme/workflow-oncall", home, root)).toEqual({
      kind: "name",
      install: "@acme/workflow-oncall",
      imported: "@acme/workflow-oncall",
    });
  });

  it("resolves a path now, so a directory that is not a package is refused before anything runs", () => {
    const directory = path.join(home, "not-a-package");
    fs.mkdirSync(directory);

    expect(() => whatPackageIs(directory, home, root)).toThrow(
      /is not a package: its package.json is missing/,
    );
  });

  it("makes a path spec the package's own name, and the directory the import", () => {
    fs.mkdirSync(path.join(home, "workflow-standalone"));
    fs.writeFileSync(
      path.join(home, "workflow-standalone", "package.json"),
      '{"name":"@acme/workflow-standalone","type":"module","main":"./index.js"}',
      "utf-8",
    );
    fs.writeFileSync(
      path.join(home, "workflow-standalone", "index.js"),
      'export const plugin = { name: "@acme/workflow-standalone", version: "0.1.0", register() {} };\n',
      "utf-8",
    );

    const picked = whatPackageIs("./workflow-standalone", home, root);

    expect(picked.kind).toBe("path");
    expect(picked.install).toBe(path.join(home, "workflow-standalone"));
    // The config carries the name the package declares, not a URL into one
    // directory on one machine.
    expect(picked.imported).toBe("@acme/workflow-standalone");
  });

  it("reads a tarball's name off the manifest npm wrote, and asks for exactly one", () => {
    fs.mkdirSync(path.join(root, "node_modules", "@acme", "workflow-oncall"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "node_modules", "@acme", "workflow-oncall", "package.json"),
      '{"name":"@acme/workflow-oncall"}',
      "utf-8",
    );

    expect(whatPackageIs("https://example.test/wf.tgz", home, root)).toEqual({
      kind: "tarball",
      install: "https://example.test/wf.tgz",
      imported: "@acme/workflow-oncall",
    });
  });

  it("defers a tarball name until npm has added it beside the existing packages", () => {
    fs.mkdirSync(path.join(root, "node_modules", "a"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "a", "package.json"), '{"name":"a"}', "utf-8");
    fs.mkdirSync(path.join(root, "node_modules", "b"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "b", "package.json"), '{"name":"b"}', "utf-8");

    expect(whatPackageIs("https://example.test/wf.tgz", home, root)).toMatchObject({
      kind: "tarball",
      install: "https://example.test/wf.tgz",
      imported: "",
    });
  });
});

describe("importPluginBySpec", () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-import-"));
    root = path.join(home, "plugins");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("takes the plugin export through the resolver", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt(
      root,
      "@acme/workflow-oncall",
      'export const plugin = { name: "@acme/workflow-oncall", version: "1.0.0", register() {} };\n',
    );

    const loaded = await importPluginBySpec(
      "@acme/workflow-oncall",
      pluginsRootResolver(home, root),
    );

    expect(loaded.ok).toBe(true);
  });

  it("says what a package that is not there is, as a command refusal rather than a boot one", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");

    const loaded = await importPluginBySpec("@acme/plugin-nowhere", pluginsRootResolver(home, root));

    expect(loaded).toEqual({
      ok: false,
      problem: "@acme/plugin-nowhere: could not be imported — @acme/plugin-nowhere is not in amy's plugins root",
    });
  });

  it("answers a path spec, resolved the way the loader resolves one", async () => {
    const directory = path.join(home, "standalone");
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, "package.json"),
      '{"name":"standalone","type":"module","main":"./index.js"}',
      "utf-8",
    );
    fs.writeFileSync(
      path.join(directory, "index.js"),
      'export const plugin = { name: "standalone", version: "0.1.0", register() {} };\n',
      "utf-8",
    );

    const loaded = await importPluginBySpec(
      pathToFileURL(path.join(directory, "index.js")).href,
      (spec) => spec,
    );

    expect(loaded.ok).toBe(true);
  });
});

describe("whatMountingSays", () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-probe-"));
    root = path.join(home, "plugins");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("answers workflow for a package that registers one", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{"name":"amy-plugins","private":true}\n',
      "utf-8",
    );
    packageAt(
      root,
      "@acme/workflow-oncall",
      `const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesActions: [],
  usesObservers: [],
  plan: (record) =>
    record.state === "paged"
      ? { kind: "advance", to: "acknowledged", effects: [], why: "the page was picked up" }
      : { kind: "settled", why: "the page was handled" },
};

export const plugin = {
  name: "@acme/workflow-oncall",
  version: "1.0.0",
  register(registry) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", {
      policy: {},
      found: async () => [],
      newRecord: (id, now) => ({ id, state: "paged", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      observe: async () => ({}),
      handlers: () => ({}),
      apply: (record) => record,
    });
  },
};
`,
    );

    const loaded = await importPluginBySpec("@acme/workflow-oncall", pluginsRootResolver(home, root));
    expect(loaded.ok).toBe(true);

    const probe = await whatMountingSays(loaded.ok ? loaded.plugin : ({} as never), home);

    expect(probe).toEqual({ ok: true, workflow: true });
  });

  it("answers plugin for a package that mounts only a port", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt(
      root,
      "@acme/plugin-extra",
      `export const plugin = {
  name: "@acme/plugin-extra",
  version: "0.1.0",
  register(registry) {
    registry.port("brief", { get: async () => undefined });
  },
};
`,
    );

    const loaded = await importPluginBySpec("@acme/plugin-extra", pluginsRootResolver(home, root));
    expect(loaded.ok).toBe(true);

    const probe = await whatMountingSays(loaded.ok ? loaded.plugin : ({} as never), home);

    expect(probe).toEqual({ ok: true, workflow: false });
  });

  it("refuses a package that cannot mount, naming the problem", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt(
      root,
      "@acme/plugin-refusing",
      `export const plugin = {
  name: "@acme/plugin-refusing",
  version: "0.1.0",
  register(registry) {
    registry.workflow({ name: "w" });
    registry.workflow({ name: "w2" });
  },
};
`,
    );

    const loaded = await importPluginBySpec("@acme/plugin-refusing", pluginsRootResolver(home, root));
    expect(loaded.ok).toBe(true);

    const probe = await whatMountingSays(loaded.ok ? loaded.plugin : ({} as never), home);

    expect(probe.ok).toBe(false);
  });

  it("leaves nothing behind the probe created", async () => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
    packageAt(
      root,
      "@acme/plugin-scribbler",
      `export const plugin = {
  name: "@acme/plugin-scribbler",
  version: "0.1.0",
  register(_registry, ctx) {
    ctx.paths.state;
  },
};
`,
    );

    const loaded = await importPluginBySpec("@acme/plugin-scribbler", pluginsRootResolver(home, root));
    expect(loaded.ok).toBe(true);

    await whatMountingSays(loaded.ok ? loaded.plugin : ({} as never), home);

    expect(fs.existsSync(path.join(home, "add-probe"))).toBe(false);
  });
});

describe("whatBoots and the removal refusal", () => {
  it("relays the mount's answer either way", async () => {
    const ok = await whatBoots(async () => ({
      ok: true as const,
      problems: [],
      mounted: { workflow: { usesActions: ["triage"] } } as never,
    }));
    expect(ok.ok).toBe(true);

    const refused = await whatBoots(async () => ({
      ok: false as const,
      problems: ["action `triage`: needs the `agent` port, which nothing mounted"],
    }));
    expect(refused.ok).toBe(false);
  });

  it("names the unmet need an action carried, in the words the mount wrote", () => {
    const mounted = { workflow: { usesActions: ["triage", "open-pull-request"] } } as never;

    expect(
      unmetAction(mounted, [
        "action `open-pull-request`: needs the `code-host` port, which nothing mounted",
        "something else",
      ]),
    ).toContain("open-pull-request");
  });

  it("keeps the names that remain, so the config the removal would write is exact", () => {
    expect(withoutSpec(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("uninstallFromPluginsRoot", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-uninstall-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "amy-plugins", private: true, dependencies: { "@acme/local": "file:../local", "@acme/keep": "1.0.0" } })}\n`,
      "utf-8",
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("makes the manifest authoritative for a file dependency, then prunes and reinstalls", async () => {
    const calls: string[][] = [];
    const runner = {
      run: async (_command: string, args: string[]) => {
        calls.push(args);
        return { ok: true, exitCode: 0, stdout: "done", stderr: "" };
      },
    };

    const outcome = await uninstallFromPluginsRoot(runner, root, ["@acme/local"]);

    expect(outcome.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))).toMatchObject({
      dependencies: { "@acme/keep": "1.0.0" },
    });
    expect(calls.map(([verb]) => verb)).toEqual(["prune", "install"]);
    expect(calls.every((args) => args.includes("--prefix") && args.includes(root))).toBe(true);
  });
});

describe("the config the two commands write", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-config-"));
    fs.writeFileSync(
      path.join(home, "config.yaml"),
      `repos:\n  - acme/widgets\n\nworkflows:\n  oncall:\n    workflow: "@acme/workflow-oncall"\n`,
      "utf-8",
    );
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("adds one extra plugin without copying the recommended set into the config", () => {
    const before = loadConfig(home);
    writeExtraPlugins(home, [...before.extraPlugins, "@acme/plugin-extra"]);

    const after = loadConfig(home);
    expect(after.extraPlugins).toEqual(["@acme/plugin-extra"]);
    expect(after.workflows.oncall).toEqual({ workflow: "@acme/workflow-oncall" });
  });

  it("removes one extra plugin and leaves the rest", () => {
    writeExtraPlugins(home, ["@acme/plugin-a", "@acme/plugin-b"]);
    removeExtraPlugin(home, "@acme/plugin-a");

    expect(loadConfig(home).extraPlugins).toEqual(["@acme/plugin-b"]);
  });

  it("writes a workflow profile that pluginList mounts, with no plugins copied", () => {
    writeWorkflowProfile(home, "weekly", "@acme/workflow-weekly", loadConfig(home));

    const config = loadConfig(home);
    const declared = config.workflows.weekly?.workflow ?? "";
    const profile = {
      name: "weekly",
      workflow: declared,
      plugins: [],
      takesNotes: false,
      takesTasks: false,
    } satisfies Profile;

    // The recommendation is derived at every read, not frozen at add time:
    // a later amy recommending one more plugin hands it to this profile too.
    expect(declared).toBe("@acme/workflow-weekly");
    expect(pluginList(config, profile)[0]).toBe("@acme/workflow-weekly");
    expect(pluginList(config, profile)).toContain("@amykit/plugin-file-queue");
    expect(pluginList(config, profile)).not.toContain("@acme/workflow-oncall");
  });

  it("mounts an extra plugin under a profile that stays on its recommendation", () => {
    const config = { ...DEFAULT_CONFIG, extraPlugins: ["@acme/plugin-extra"] };
    const oncall: Profile = {
      name: "oncall",
      workflow: "@acme/workflow-oncall",
      plugins: [],
      takesNotes: false,
      takesTasks: false,
    };

    expect(pluginList(config, oncall)).toContain("@acme/plugin-extra");
    expect(pluginList(config, oncall)).not.toContain("@amykit/plugin-linear");
  });

  it("deduplicates a plugin named in both places, because mount() refuses the second claim", () => {
    const config = { ...DEFAULT_CONFIG, extraPlugins: ["@amykit/plugin-file-queue"] };
    const oncall: Profile = {
      name: "oncall",
      workflow: "@acme/workflow-oncall",
      plugins: [],
      takesNotes: false,
      takesTasks: false,
    };

    expect(pluginList(config, oncall).filter((name) => name === "@amykit/plugin-file-queue")).toHaveLength(1);
  });
});

describe("the loader answers an added workflow the boot asks for", () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-loader-"));
    root = path.join(home, "plugins");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"amy-plugins","private":true}\n', "utf-8");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("resolves an added package through the root the config carries", async () => {
    packageAt(
      root,
      "@acme/workflow-oncall",
      'export const plugin = { name: "@acme/workflow-oncall", version: "1.0.0", register() {} };\n',
    );

    const result = await load(["@acme/workflow-oncall"], pluginsRootResolver(home, root), root);

    expect(result.bySpec.get("@acme/workflow-oncall")?.name).toBe("@acme/workflow-oncall");
    expect(result.problems).toEqual([]);
  });
});