import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { amyHome } from "../src/home.js";
import { paths, profileRoot } from "../src/paths.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { forkPlace } from "../src/fork.js";
import { Profile } from "../src/profiles.js";
import { writeWorkflow } from "../src/workflow.js";

describe("the paths one amy owns", () => {
  it("keeps plugins under the state directory", () => {
    const home = path.join(os.tmpdir(), "amy-paths-home");

    expect(paths(home).plugins).toBe(path.join(home, "plugins"));
  });

  it("moves the plugin root when AMY_HOME moves", () => {
    const configured = path.join(os.tmpdir(), "amy-other-home");
    const home = amyHome({ AMY_HOME: configured });

    expect(paths(home).plugins).toBe(path.join(configured, "plugins"));
  });
});
describe("where a fork goes", () => {
  const profile = (workflow: string, extra: Partial<Profile> = {}): Profile => ({
    name: "oncall", workflow, plugins: [], takesNotes: false, takesTasks: false, settings: {}, ...extra,
  });

  it("lands inside the project of a workflow of your own, and under the profile in AMY_HOME for an installed one, which AMY_HOME moves", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-fork-place-"));
    try {
      writeWorkflow(home, "oncall", DEFAULT_CONFIG);
      const project = path.join(home, "projects", "invoices");
      fs.mkdirSync(path.join(project, "workflow"), { recursive: true });
      const moved = amyHome({ AMY_HOME: path.join(home, "moved") });

      expect(forkPlace(home, profile("oncall"), "@amykit/plugin-linear")).toBe(path.join(home, "workflows", "oncall", "forks", "plugin-linear"));
      expect(forkPlace(home, profile(path.join(project, "workflow"), { project: { root: project, phase: "workflow" } }), "@amykit/plugin-linear"))
        .toBe(path.join(project, "forks", "plugin-linear"));
      expect(forkPlace(home, profile("@acme/workflow-oncall"), "@amykit/plugin-linear")).toBe(path.join(home, "profiles", "oncall", "forks", "plugin-linear"));
      expect(forkPlace(moved, profile("@acme/workflow-oncall"), "@amykit/plugin-linear")).toBe(path.join(home, "moved", "profiles", "oncall", "forks", "plugin-linear"));
      expect(profileRoot(moved, "oncall")).toBe(path.join(home, "moved", "plugins", "profiles", "oncall"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("goes where `--to` says, then where the config's `forks` says, one directory per profile", () => {
    const home = path.join(os.tmpdir(), "amy-fork-elsewhere");

    expect(forkPlace(home, profile("@acme/workflow-oncall"), "@amykit/plugin-linear", { to: "/srv/forks", forks: "/var/forks" })).toBe(path.join("/srv/forks", "plugin-linear"));
    expect(forkPlace(home, profile("@acme/workflow-oncall"), "@amykit/plugin-linear", { forks: "/var/forks" })).toBe(path.join("/var/forks", "oncall", "plugin-linear"));
  });
});
