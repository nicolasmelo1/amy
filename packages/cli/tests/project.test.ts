import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BriefStore } from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import { assembleProfile } from "../src/assemble.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { isFilesystemWorkflow, load, pluginsRootResolver } from "../src/loader.js";
import { profileDaemonPids, profileOwnedDirectories, profilePaths } from "../src/paths.js";
import { missingPhase, profiles } from "../src/profiles.js";
import { hostPaths, pluginSlices, worktreeNamespace } from "../src/slices.js";

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

  it("makes a lone workflow directory a phase, with no new configuration key", () => {
    const only = profiles({ ...DEFAULT_CONFIG, workflows: { execution: { workflow: path.join(root, "workflow") } } });

    expect(only.execution?.project).toMatchObject({ root, phase: "workflow" });
    expect(profilePaths("/amy", only.execution!).records).not.toBe("/amy/execution/records");
    expect(only.execution?.agent).toBeUndefined();
  });

  it("leaves a packaged workflow exactly where it always was", () => {
    const packaged = profiles({ ...DEFAULT_CONFIG, workflows: { tickets: { workflow: "@amykit/workflow-ticket-to-qa" } } });
    const place = profilePaths("/amy", packaged.tickets!);

    expect(packaged.tickets?.project).toBeUndefined();
    expect([place.records, place.queue, place.pid, place.log, place.tasks]).toEqual(
      ["/amy/tickets/records", "/amy/tickets/queue", "/amy/daemon.pid", "/amy/log", "/amy/tasks"],
    );
    expect(hostPaths(DEFAULT_CONFIG, "/amy", packaged.tickets!).artifacts).toBeUndefined();
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

  it("does not make an unrelated directory a phase", () => {
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: {
        execution: { workflow: path.join(root, "workflow") },
        other: { workflow: path.join(root, "other") },
      },
    });

    expect(known.other?.project).toBeUndefined();
    expect(known.execution?.project).toMatchObject({ root, phase: "workflow" });
  });

  it("never picks up the records an old profile of the same name left", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-state-"));
    try {
      fs.mkdirSync(path.join(home, "execution", "records"), { recursive: true });
      fs.mkdirSync(path.join(home, "execution", "queue"), { recursive: true });
      const execution = profiles(config, home).execution!;
      const place = profilePaths(home, execution);

      // A phase is its project's, whatever ran under the name before it.
      expect(place.records).not.toBe(path.join(home, "execution", "records"));
      expect(place.queue).not.toBe(path.join(home, "execution", "queue"));
      expect((pluginSlices(config, execution, home)["@amykit/plugin-file-worktree"] as { recordsDirectory: string }).recordsDirectory)
        .toBe(place.records);
      expect(hostPaths(config, home, execution).artifacts).toBe(hostPaths(config, home, profiles(config, home).grooming!).artifacts);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("forgets a phase's tasks and threads with it, and never its log", () => {
    const known = profiles(config);
    const owned = profileOwnedDirectories("/amy", known.execution!);
    const place = profilePaths("/amy", known.execution!);

    expect(owned).toEqual([place.records, place.queue, place.tasks, place.slack]);
    expect(owned).not.toContain(place.log);
    expect(owned).not.toContain(place.artifacts);
    // An ordinary profile shares its tasks and threads, so it forgets neither.
    expect(profileOwnedDirectories("/amy", { name: "tickets", workflow: "@amykit/workflow-ticket-to-qa", plugins: [], takesNotes: false, takesTasks: false }))
      .toEqual(["/amy/tickets/records", "/amy/tickets/queue"]);
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

  it("gives a repointed phase project a fresh worktree namespace", () => {
    const first = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: path.join("/projects", "invoices", "workflow") } },
    }).execution!;
    const second = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: path.join("/projects", "payroll", "workflow") } },
    }).execution!;

    expect(worktreeNamespace(first)).not.toBe(worktreeNamespace(second));
    const worktree = pluginSlices(
      { ...DEFAULT_CONFIG, workflows: { execution: { workflow: second.workflow } } },
      second,
    )["@amykit/plugin-file-worktree"] as { workflow: string };
    expect(worktree.workflow).toBe(worktreeNamespace(second));
    expect(worktreeNamespace(profiles({
      ...DEFAULT_CONFIG,
      workflows: { tickets: { workflow: "@amykit/workflow-ticket-to-qa" } },
    }).tickets!)).toBe("tickets");
  });

  it("keeps a running phase discoverable when its profile is repointed", () => {
    const first = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: path.join("/projects", "invoices", "workflow") } },
    }).execution!;
    const second = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: path.join("/projects", "payroll", "workflow") } },
    }).execution!;

    expect(profilePaths("/amy", first).pid).toBe(profilePaths("/amy", second).pid);
    expect(profilePaths("/amy", first).records).not.toBe(profilePaths("/amy", second).records);
  });

  it("keeps both daemon layouts visible while a profile changes shape", () => {
    const packaged = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: "@amykit/workflow-ticket-to-qa" } },
    }).execution!;
    const phase = profiles({
      ...DEFAULT_CONFIG,
      workflows: { execution: { workflow: path.join(root, "workflow") } },
    }).execution!;

    expect(profileDaemonPids("/amy", phase)).toEqual(["/amy/profiles/execution/daemon.pid", "/amy/daemon.pid"]);
    expect(profileDaemonPids("/amy", packaged)).toEqual(["/amy/daemon.pid", "/amy/profiles/execution/daemon.pid"]);
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

  it("rejects global record directory overrides for phases rather than sharing their state", () => {
    const home = "/amy";
    const known = profiles(config, home);
    const overridden = {
      ...config,
      plugins: { "@amykit/plugin-file-store": { directory: "records-on-volume" } },
    };

    expect(() => pluginSlices(overridden, known.execution!, home))
      .toThrow("@amykit/plugin-file-store.directory is shared across profiles");
  });

  it("rejects global queue directory overrides for phases rather than splitting writers from mounts", () => {
    const home = "/amy";
    const known = profiles(config, home);
    const overridden = {
      ...config,
      plugins: { "@amykit/plugin-file-queue": { directory: "queue-on-volume" } },
    };

    expect(() => pluginSlices(overridden, known.execution!, home))
      .toThrow("@amykit/plugin-file-queue.directory is shared across profiles");
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

/**
 * The cross-phase delivery, proven through the assembly `amy` itself runs:
 * two configured phase workflows, each mounted with its own derived slices
 * and host paths, and neither naming a directory of the other.
 */
describe("a brief crosses the phase boundary", () => {
  let base: string;
  let home: string;
  let project: string;

  const services = () => ({
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    load: (specs: readonly string[]) => {
      const fromHome = pluginsRootResolver(home, path.join(home, "plugins"));
      return load(specs, (spec) => isFilesystemWorkflow(spec) ? fromHome(spec) : spec);
    },
    log: (file: string) => new FileEventLog(file),
    host: [],
  });

  /** A phase directory the way somebody writes one: an index exporting a workflow. */
  function phase(name: "brief" | "workflow" | "test"): string {
    const directory = path.join(project, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.js"), `export const plugin = {
  name: "invoices-${name}",
  version: "1.0.0",
  register(registry) {
    registry.workflow({
      name: "invoices-${name}",
      states: ["START", "DONE"],
      waitingStates: [],
      initialState: "START",
      terminalStates: ["DONE"],
      usesObservers: [],
      plan: () => ({ kind: "settled", why: "fixture" }),
    });
    registry.contribute("workflow-runtime", "invoices-${name}", {
      policy: {},
      found: async () => [],
      newRecord: (id, now) => ({ id, state: "START", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      observe: async () => ({}),
      actions: {},
      apply: (record) => record,
    });
  },
};
`, "utf-8");
    return directory;
  }

  function configured(workflows: Record<string, string>) {
    const mounts = (workflow: string) => [
      "@amykit/plugin-file-queue",
      "@amykit/plugin-file-store",
      "@amykit/plugin-file-brief-store",
      workflow,
      "@amykit/plugin-serial-engine",
    ];
    return {
      ...DEFAULT_CONFIG,
      notify: { hermes: null, inbox: false },
      workflows: Object.fromEntries(Object.entries(workflows).map(([name, workflow]) => [name, { workflow, plugins: mounts(workflow) }])),
    };
  }

  async function briefPort(config: ReturnType<typeof configured>, name: string): Promise<BriefStore> {
    const assembled = await assembleProfile(home, config, profiles(config, home)[name]!, services());
    if (!assembled.ok) throw new Error(assembled.problems.join("; "));
    const store = assembled.mounted.ports.get("brief") as BriefStore | undefined;
    if (!store) throw new Error(`${name} mounted no brief port`);
    return store;
  }

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-phase-boundary-"));
    home = path.join(base, ".amy");
    project = path.join(base, "invoices");
    fs.mkdirSync(home, { recursive: true });
  });

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it("reads, in the execution phase, the brief the grooming phase wrote", async () => {
    const config = configured({ grooming: phase("brief"), execution: phase("workflow") });

    const grooming = await briefPort(config, "grooming");
    await grooming.write({
      id: "invoices",
      sections: [{ name: "Goal", body: "One currency on every invoice line." }],
      explains: ["BILL-4021"],
      at: "2026-09-30T12:00:00.000Z",
    });

    const execution = await briefPort(config, "execution");
    expect((await execution.get("invoices"))?.sections).toEqual([{ name: "Goal", body: "One currency on every invoice line." }]);

    // It lives at the project's root: not in the state every profile on the
    // machine shares, where a second project's brief of the same id would
    // land on it, and not in either phase's own state.
    const artifacts = profilePaths(home, profiles(config, home).grooming!).artifacts!;
    expect(fs.existsSync(path.join(artifacts, "briefs", "invoices.json"))).toBe(true);
    expect(fs.existsSync(path.join(home, "briefs"))).toBe(false);
    // Nothing in the config names a shared directory.
    expect(JSON.stringify(config)).not.toContain("briefs");
    for (const name of ["grooming", "execution"]) {
      const own = profilePaths(home, profiles(config, home)[name]!);
      expect(fs.existsSync(path.join(path.dirname(own.records), "briefs"))).toBe(false);
      expect(path.relative(home, own.artifacts!).startsWith("..")).toBe(false);
    }
  });

  it("names the missing brief/ when a project has no grooming phase", () => {
    const config = configured({ execution: phase("workflow") });
    const execution = profiles(config, home).execution!;

    expect(missingPhase(execution, "brief")).toContain(path.join(project, "brief"));
    phase("brief");
    expect(missingPhase(execution, "brief")).toBeUndefined();
  });

  it("keeps each phase's tasks and threads out of the other's", () => {
    const config = configured({ grooming: phase("brief"), execution: phase("workflow") });
    const known = profiles(config, home);
    const slices = (name: string) => pluginSlices(config, known[name]!, home) as Record<string, Record<string, string>>;

    expect(slices("grooming")["@amykit/plugin-file-tasks"]?.directory)
      .not.toBe(slices("execution")["@amykit/plugin-file-tasks"]?.directory);
    expect(slices("grooming")["@amykit/plugin-slack"]?.directory)
      .not.toBe(slices("execution")["@amykit/plugin-slack"]?.directory);
    expect(profilePaths(home, known.grooming!).tasks).toBe(path.join(home, slices("grooming")["@amykit/plugin-file-tasks"]!.directory!));
  });
});
