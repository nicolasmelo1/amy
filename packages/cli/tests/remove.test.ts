import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { Profile } from "../src/profiles.js";
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
});
