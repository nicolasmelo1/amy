import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { profilePaths } from "../src/paths.js";
import { profiles } from "../src/profiles.js";
import { hostPaths, pluginSlices } from "../src/slices.js";

describe("a project is three phases", () => {
  const root = path.join("/projects", "invoices");
  const config = {
    ...DEFAULT_CONFIG,
    workflows: {
      grooming: {
        workflow: path.join(root, "brief"),
        agent: { ladder: ["claude:opus"], budget: { perFiveHours: { tokens: 1000 } } },
      },
      execution: {
        workflow: path.join(root, "workflow"),
        agent: { ladder: ["claude:haiku"], budget: { perFiveHours: { tokens: 20 } } },
      },
      proving: { workflow: path.join(root, "test") },
    },
  };

  it("gives every phase its own queue, records, log and budget", () => {
    const known = profiles(config);
    const phasePaths = Object.values(known).map((profile) => profilePaths("/amy", profile));

    expect(new Set(phasePaths.map((place) => place.queue)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.records)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.log)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.pid)).size).toBe(3);
  });

  it("shares briefs through the project artifact root, never another phase state", () => {
    const known = profiles(config);
    const grooming = known.grooming!;
    const execution = known.execution!;
    const groomingPaths = hostPaths(config, "/amy", grooming);
    const executionPaths = hostPaths(config, "/amy", execution);

    expect(groomingPaths.artifacts).toBe(executionPaths.artifacts);
    expect(groomingPaths.artifacts).not.toContain("..");
    expect(pluginSlices(config, grooming)["@amykit/plugin-file-brief-store"]).toEqual({ directory: "briefs" });
    expect(pluginSlices(config, execution)["@amykit/plugin-file-brief-store"]).toEqual({ directory: "briefs" });
  });

  it("lets the grooming and execution phases choose separate model ladders and budgets", () => {
    const known = profiles(config);
    const grooming = pluginSlices(config, known.grooming!) as Record<string, Record<string, unknown>>;
    const execution = pluginSlices(config, known.execution!) as Record<string, Record<string, unknown>>;

    expect(grooming["@amykit/plugin-agent-relay"]?.ladder).toEqual(["claude:opus"]);
    expect(execution["@amykit/plugin-agent-relay"]?.ladder).toEqual(["claude:haiku"]);
    expect(grooming["@amykit/plugin-agent-relay"]?.budget).not.toEqual(execution["@amykit/plugin-agent-relay"]?.budget);
  });

  it("keeps a workflow-only project compatible without a new configuration key", () => {
    const only = profiles({ ...DEFAULT_CONFIG, workflows: { execution: { workflow: path.join(root, "workflow") } } });

    expect(only.execution?.project).toBeUndefined();
    expect(profilePaths("/amy", only.execution!).records).toBe("/amy/execution/records");
    expect(only.execution?.agent).toBeUndefined();
  });

  it("treats solitary brief and test directories as phases", () => {
    for (const phase of ["brief", "test"] as const) {
      const known = profiles({
        ...DEFAULT_CONFIG,
        workflows: { [phase]: { workflow: path.join(root, phase) } },
      });

      expect(known[phase]?.project).toMatchObject({ root, phase });
      expect(profilePaths("/amy", known[phase]!).pid).not.toBe("/amy/daemon.pid");
    }
  });

  it("does not let an unrelated sibling turn a legacy workflow into a phase", () => {
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: {
        execution: { workflow: path.join(root, "workflow") },
        other: { workflow: path.join(root, "other") },
      },
    });

    expect(known.execution?.project).toBeUndefined();
  });

  it("keeps existing legacy state when a sibling phase is later added", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-state-"));
    try {
      fs.mkdirSync(path.join(home, "execution", "records"), { recursive: true });
      const known = profiles(config);

      expect(profilePaths(home, known.execution!).records).toBe(path.join(home, "execution", "records"));
      expect(profilePaths(home, known.execution!).pid).toBe(path.join(home, "daemon.pid"));
      expect((pluginSlices(config, known.execution!, home)["@amykit/plugin-file-store"] as { directory: string }).directory)
        .toBe("execution/records");
      expect((pluginSlices(config, known.execution!, home)["@amykit/plugin-file-worktree"] as { recordsDirectory: string }).recordsDirectory)
        .toBe(path.join(home, "execution", "records"));
      expect(hostPaths(config, home, known.execution!).artifacts).toBeDefined();
      expect(profilePaths(home, known.execution!).log).not.toBe(path.join(home, "log"));
      expect((pluginSlices(config, known.execution!, home)["@amykit/plugin-file-brief-store"] as { directory: string }).directory)
        .toBe("briefs");

      // A daemon creates its phase PID/log directory; that cannot make the
      // following mount abandon the legacy queue and records.
      const phase = profilePaths(home, known.execution!);
      fs.mkdirSync(path.dirname(phase.pid), { recursive: true });
      expect(profilePaths(home, known.execution!).records).toBe(path.join(home, "execution", "records"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps the project state component bounded for long valid paths", () => {
    const longRoot = path.join("/projects", "x".repeat(500));
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: {
        grooming: { workflow: path.join(longRoot, "brief") },
        execution: { workflow: path.join(longRoot, "workflow") },
      },
    });

    const component = profilePaths("/amy", known.execution!).records.split(path.sep)[3]!;
    expect(component).toHaveLength(43);
  });

  it("keeps profiles sharing a phase directory out of one another's state", () => {
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: {
        one: { workflow: path.join(root, "workflow") },
        two: { workflow: path.join(root, "workflow") },
        brief: { workflow: path.join(root, "brief") },
      },
    });

    expect(profilePaths("/amy", known.one!).queue).not.toBe(profilePaths("/amy", known.two!).queue);
  });

  it("keeps a surviving workflow phase in its existing project state", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-survivor-"));
    try {
      const phaseConfig = {
        ...DEFAULT_CONFIG,
        workflows: { execution: { workflow: path.join(root, "workflow") }, grooming: { workflow: path.join(root, "brief") } },
      };
      const phase = profiles(phaseConfig, home).execution!;
      fs.mkdirSync(path.dirname(profilePaths(home, phase).pid), { recursive: true });

      const survivor = profiles({ ...DEFAULT_CONFIG, workflows: { execution: phaseConfig.workflows.execution } }, home).execution!;
      expect(survivor.project).toMatchObject({ root, phase: "workflow" });
      expect(profilePaths(home, survivor).pid).toBe(profilePaths(home, phase).pid);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("normalizes an explicit relative workflow plugin only for runtime mounting", () => {
    const home = "/amy-home";
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: "./project/workflow", plugins: ["./project/workflow"] } },
    }, home);

    expect(known.execution?.workflow).toBe(path.join(home, "project", "workflow"));
    expect(known.execution?.plugins).toEqual([path.join(home, "project", "workflow")]);
  });

  it("does not mistake the shared projects namespace for a legacy profile", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-projects-profile-"));
    try {
      const known = profiles({
        ...DEFAULT_CONFIG,
        workflows: {
          projects: { workflow: path.join(root, "brief") },
          execution: { workflow: path.join(root, "workflow") },
        },
      });
      const place = profilePaths(home, known.projects!);
      fs.mkdirSync(path.dirname(place.records), { recursive: true });

      expect(profilePaths(home, known.projects!).records).toBe(place.records);
      expect(profilePaths(home, known.projects!).queue).toBe(place.queue);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses profile names that could escape their phase state directory", () => {
    expect(() => profiles({
      ...DEFAULT_CONFIG,
      workflows: { "../../../outside": { workflow: path.join(root, "brief") } },
    })).toThrow("a workflow profile name must be one path component");
    expect(() => profiles({
      ...DEFAULT_CONFIG,
      workflows: { "": { workflow: path.join(root, "brief") } },
    })).toThrow("a workflow profile name must be one path component");
  });

  it("gives every worktree reader the file store directory an operator overrides", () => {
    const home = "/amy";
    const known = profiles(config, home);
    const overridden = {
      ...config,
      plugins: { "@amykit/plugin-file-store": { directory: "records-on-volume" } },
    };
    const slices = pluginSlices(overridden, known.execution!, home) as Record<string, Record<string, string>>;

    expect(slices["@amykit/plugin-file-store"]?.directory).toBe("records-on-volume");
    expect(slices["@amykit/plugin-file-worktree"]?.recordsDirectory).toBe(path.join(home, "records-on-volume"));
  });

  it("keeps an absolute-looking record override on the file store's state-root path", () => {
    const home = "/amy";
    const known = profiles(config, home);
    const overridden = {
      ...config,
      plugins: { "@amykit/plugin-file-store": { directory: "/records-on-volume" } },
    };
    const slices = pluginSlices(overridden, known.execution!, home) as Record<string, Record<string, string>>;

    expect(slices["@amykit/plugin-file-store"]?.directory).toBe("/records-on-volume");
    expect(slices["@amykit/plugin-file-worktree"]?.recordsDirectory).toBe(path.join(home, "/records-on-volume"));
  });

  it("keeps prototype-named profiles as configured own entries", () => {
    const workflows: Record<string, { workflow: string }> = Object.create(null);
    workflows["__proto__"] = { workflow: path.join(root, "brief") };
    workflows["constructor"] = { workflow: path.join(root, "test") };

    const known = profiles({ ...DEFAULT_CONFIG, workflows });

    expect(known["__proto__"]?.name).toBe("__proto__");
    expect(known.constructor?.name).toBe("constructor");
  });
});
