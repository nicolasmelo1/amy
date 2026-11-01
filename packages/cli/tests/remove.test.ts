import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { Profile, profiles } from "../src/profiles.js";
import { RemovalDeps, removeProfileAndState } from "../src/removal.js";
import { carriedBy, configWithout, stillMounted } from "../src/remove.js";
import { pluginList } from "../src/slices.js";

const ONCALL: Profile = {
  name: "oncall",
  workflow: "@acme/workflow-oncall",
  plugins: ["@acme/plugin-local"],
  takesNotes: false,
  takesTasks: false,
};
const WEEKLY: Profile = {
  name: "weekly",
  workflow: "@acme/workflow-weekly",
  plugins: ["@acme/plugin-local"],
  takesNotes: false,
  takesTasks: false,
};

function config() {
  return {
    ...DEFAULT_CONFIG,
    workflows: {
      oncall: { workflow: ONCALL.workflow, plugins: [...ONCALL.plugins] },
      weekly: { workflow: WEEKLY.workflow, plugins: [...WEEKLY.plugins] },
    },
  };
}

describe("remove configuration", () => {
  it("removes a machine-wide extra from its source before its effective profile occurrence", () => {
    const before = { ...config(), extraPlugins: ["@acme/plugin-local", "@acme/plugin-extra"] };

    expect(carriedBy(before, ONCALL, "@acme/plugin-local")).toEqual({ place: "extras" });
    const after = configWithout(before, ONCALL, "@acme/plugin-local", { place: "extras" });

    expect(after.extraPlugins).toEqual(["@acme/plugin-extra"]);
    expect(after.workflows.oncall?.plugins).toEqual(["@acme/plugin-local"]);
  });

  it("does not copy extras into a profile when making a recommended removal explicit", () => {
    const before = {
      ...config(),
      workflows: { oncall: { workflow: ONCALL.workflow }, weekly: { workflow: WEEKLY.workflow } },
      extraPlugins: ["@acme/plugin-extra"],
    };
    const implicit: Profile = { ...ONCALL, plugins: [] };
    const after = configWithout(before, implicit, "@amykit/plugin-file-queue", { place: "profile", profile: "oncall" });

    expect(after.workflows.oncall?.plugins).not.toContain("@acme/plugin-extra");
    expect(after.extraPlugins).toEqual(["@acme/plugin-extra"]);
    expect(pluginList(after, { ...implicit, plugins: after.workflows.oncall?.plugins ?? [] })).toContain("@acme/plugin-extra");
  });

  it("keeps a shared package installed while another profile still mounts it", () => {
    const before = config();
    const after = configWithout(before, ONCALL, "@acme/plugin-local", { place: "profile", profile: "oncall" });

    expect(pluginList(after, { ...ONCALL, plugins: after.workflows.oncall?.plugins ?? [] })).not.toContain("@acme/plugin-local");
    expect(stillMounted(after, "@acme/plugin-local")).toBe(true);
  });

  it("finds and removes the profile that carries a plugin outside the selected workflow", () => {
    const before = {
      ...config(),
      workflows: {
        oncall: { workflow: ONCALL.workflow },
        weekly: { workflow: WEEKLY.workflow, plugins: ["@acme/plugin-local"] },
      },
    };
    const carrier = carriedBy(before, { ...ONCALL, plugins: [] }, "@acme/plugin-local");

    expect(carrier).toEqual({ place: "profile", profile: "weekly" });
    const after = configWithout(before, ONCALL, "@acme/plugin-local", carrier);
    expect(after.workflows.oncall?.plugins).toBeUndefined();
    expect(after.workflows.weekly?.plugins).toEqual([]);
  });

  it("does not inject the removed legacy brief provider into its removal trial", () => {
    const before = {
      ...config(),
      workflows: {
        oncall: { workflow: ONCALL.workflow, plugins: ["@amykit/plugin-file-store"] },
        weekly: { workflow: WEEKLY.workflow, plugins: ["@acme/plugin-local"] },
      },
    };
    const legacy = { ...ONCALL, plugins: ["@amykit/plugin-file-store"] };
    const after = configWithout(before, legacy, "@amykit/plugin-file-brief-store", {
      place: "profile",
      profile: "oncall",
    });

    expect(pluginList(after, { ...legacy, briefStore: after.workflows.oncall?.briefStore })).not.toContain(
      "@amykit/plugin-file-brief-store",
    );
  });

  it("clears an explicit BriefStore selector when its provider is removed", () => {
    const before = {
      ...config(),
      workflows: {
        oncall: {
          workflow: ONCALL.workflow,
          plugins: ["@amykit/plugin-file-store", "@acme/plugin-git-brief-store"],
          briefStore: "@acme/plugin-git-brief-store",
        },
        weekly: { workflow: WEEKLY.workflow, plugins: ["@acme/plugin-local"] },
      },
    };
    const profile = { ...ONCALL, plugins: before.workflows.oncall.plugins, briefStore: before.workflows.oncall.briefStore };
    const after = configWithout(before, profile, "@acme/plugin-git-brief-store", { place: "profile", profile: "oncall" });

    expect(after.workflows.oncall?.briefStore).toBe("");
    expect(pluginList(after, { ...profile, plugins: after.workflows.oncall?.plugins ?? [], briefStore: after.workflows.oncall?.briefStore })).not.toContain(
      "@acme/plugin-git-brief-store",
    );
  });

  it("removes only the selected owner of a shared workflow package", () => {
    const before = {
      ...config(),
      workflows: {
        oncall: { workflow: "@acme/workflow-shared" },
        weekly: { workflow: "@acme/workflow-shared" },
      },
    };
    const after = configWithout(before, { ...ONCALL, workflow: "@acme/workflow-shared", plugins: [] }, "@acme/workflow-shared", {
      place: "workflow",
      profile: "oncall",
    });

    expect(after.workflows.oncall).toBeUndefined();
    expect(after.workflows.weekly?.workflow).toBe("@acme/workflow-shared");
    expect(stillMounted(after, "@acme/workflow-shared")).toBe(true);
  });

  it("recognizes an absolute live workflow spec as its configured workflow during removal", () => {
    const home = "/amy-home";
    const before = {
      ...DEFAULT_CONFIG,
      workflows: {
        project: {
          workflow: "./project/workflow",
          plugins: ["./project/workflow", "@acme/plugin-local"],
        },
      },
    };
    const profile = profiles(before, home).project!;

    const carrier = carriedBy(before, profile, profile.workflow, home);
    const after = configWithout(before, profile, profile.workflow, carrier, home);

    expect(carrier).toEqual({ place: "workflow", profile: "project" });
    expect(after.workflows.project).toBeUndefined();
  });
});

describe("removing a workflow profile", () => {
  let home: string;

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  function aMachine(state: { records?: boolean; queue?: boolean } = {}): Profile {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-remove-"));
    fs.writeFileSync(
      path.join(home, "config.yaml"),
      [
        "repos:",
        "  - acme/widgets",
        "workflows:",
        "  tickets:",
        '    workflow: "@amykit/workflow-ticket-to-qa"',
        "  plans:",
        '    workflow: "@amykit/workflow-note-to-plan"',
        "",
      ].join("\n"),
      "utf-8",
    );
    for (const directory of [
      ...(state.records === false ? [] : [path.join(home, "tickets", "records")]),
      ...(state.queue === false ? [] : [path.join(home, "tickets", "queue")]),
    ]) {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "one.json"), "{}", "utf-8");
    }
    return profiles(loadConfig(home), home).tickets!;
  }

  function deps(overrides: Partial<RemovalDeps> = {}): { deps: RemovalDeps; said: string[]; uninstalled: string[] } {
    const said: string[] = [];
    const uninstalled: string[] = [];
    return {
      said,
      uninstalled,
      deps: {
        running: () => undefined,
        pendingUpdate: () => false,
        uninstall: async (spec) => void uninstalled.push(spec),
        confirm: () => true,
        say: (line) => said.push(line),
        ...overrides,
      },
    };
  }

  it("drops the profile, uninstalls its package, and deletes the state it was told to", async () => {
    const profile = aMachine();
    const wired = deps();

    expect(await removeProfileAndState(home, loadConfig(home), profile, { yes: true }, wired.deps)).toBe("deleted");
    expect(Object.keys(loadConfig(home).workflows)).toEqual(["plans"]);
    expect(wired.uninstalled).toEqual(["@amykit/workflow-ticket-to-qa"]);
    // The directories go; the now-empty profile folder is nobody's to tidy.
    expect(fs.existsSync(path.join(home, "tickets", "records"))).toBe(false);
    expect(fs.existsSync(path.join(home, "tickets", "queue"))).toBe(false);
  });

  it("leaves a records directory another profile also uses", async () => {
    const profile = aMachine();
    // One override, applied to every profile: both of them read the same
    // records, so removing one must not take the other's work with it.
    fs.writeFileSync(
      path.join(home, "config.yaml"),
      [
        "repos:",
        "  - acme/widgets",
        "plugins:",
        "  \"@amykit/plugin-file-store\":",
        "    directory: shared-records",
        "workflows:",
        "  tickets:",
        '    workflow: "@amykit/workflow-ticket-to-qa"',
        "  plans:",
        '    workflow: "@amykit/workflow-note-to-plan"',
        "",
      ].join("\n"),
      "utf-8",
    );
    const shared = path.join(home, "shared-records");
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, "oncall.json"), "{}", "utf-8");

    const wired = deps();
    expect(await removeProfileAndState(home, loadConfig(home), profile, { yes: true }, wired.deps)).toBe("deleted");
    expect(fs.existsSync(shared)).toBe(true);
    expect(fs.readFileSync(path.join(shared, "oncall.json"), "utf-8")).toBe("{}");
  });

  it("keeps the state when asked to, and says how to delete it", async () => {
    const profile = aMachine();
    const wired = deps();

    expect(await removeProfileAndState(home, loadConfig(home), profile, { keepState: true }, wired.deps)).toBe("kept");
    expect(Object.keys(loadConfig(home).workflows)).toEqual(["plans"]);
    expect(fs.existsSync(path.join(home, "tickets", "records"))).toBe(true);
    expect(wired.said.join("\n")).toContain("--yes");
  });

  it("asks before deleting, and lets the answer keep it", async () => {
    const profile = aMachine();
    const asked: string[][] = [];
    const wired = deps({ confirm: (directories) => (asked.push([...directories]), false) });

    expect(await removeProfileAndState(home, loadConfig(home), profile, {}, wired.deps)).toBe("kept");
    expect(asked).toHaveLength(1);
    expect(fs.existsSync(path.join(home, "tickets", "queue"))).toBe(true);
  });

  it("refuses a profile a loop is driving, and one a scheduled update still owns", async () => {
    const profile = aMachine();
    await expect(
      removeProfileAndState(home, loadConfig(home), profile, { yes: true }, deps({ running: () => ({ workflow: "tickets", pid: 42 }) }).deps),
    ).rejects.toThrow(/running as pid 42/);
    await expect(
      removeProfileAndState(home, loadConfig(home), profile, { yes: true }, deps({ pendingUpdate: () => true }).deps),
    ).rejects.toThrow(/scheduled daemon update/);
  });

  it("leaves the log alone, because the budget is measured off it", async () => {
    const profile = aMachine();
    const wired = deps();

    await removeProfileAndState(home, loadConfig(home), profile, { yes: true }, wired.deps);

    expect(wired.said.join("\n")).toContain("The log keeps what tickets did");
    expect(wired.said.join("\n")).not.toContain("deleting log");
  });
});
