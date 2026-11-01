import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ConfigOf, PluginCommand, PluginContext, Worktree, definePlugin } from "@amykit/core";
import { configSchema } from "./config.js";

type TypedContext = PluginContext<ConfigOf<typeof configSchema>>;
import { WorktreeManager, WorktreeManagerConfig } from "./manager.js";

/** `~/worktrees` becomes an absolute path. */
function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

/**
 * Builds the manager's settings, naming what was not configured.
 *
 * `workflow` has no default this plugin could invent: the tree paths carry
 * the workflow's name so two profiles under one install never share a tree,
 * and a mount that cannot say which it is is refused rather than guessed.
 */
function settingsFor(ctx: TypedContext): WorktreeManagerConfig {
  // The CLI always derives this from the selected profile. The neutral docs
  // mount has no selected workflow, so it receives a harmless label solely to
  // enumerate the port rather than refusing documentation generation.
  const workflow = (ctx.config.workflow) || "unconfigured";

  const root = (ctx.config.root) || path.join(ctx.paths.state, "worktrees");
  const recordsDirectory = (ctx.config.recordsDirectory) || path.join(ctx.paths.state, "records");

  return {
    root: expandHome(root),
    workflow,
    defaultBranch: ctx.config.defaultBranch,
    baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
    workspaceRoot: ctx.paths.workspace,
    checkouts: ctx.paths.checkouts,
    retentionDays: ctx.config.retentionDays,
    // Read on every look, never folded in at mount: a record deleted under a
    // running install turns its tree orphaned at the next list, which is the
    // truth about what the store holds now.
    record: (workId) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(recordsDirectory, `${workId}.json`), "utf-8")) as {
          state: string;
        };
      } catch {
        return null;
      }
    },
    terminalStates: ctx.workflow()?.terminalStates ?? [],
    log: ctx.log,
  };
}

type Settings = ConfigOf<typeof configSchema>;

/** The port this plugin mounted, or the refusal that says why there is none. */
function managed(ports: ReadonlyMap<string, object> | undefined): Worktree | undefined {
  return ports?.get("worktree") as Worktree | undefined;
}

/**
 * The trees, as this plugin's own command.
 *
 * `mount: true`, because what a tree is worth removing depends on the
 * workflow's terminal states — a fact only the mounted manager holds. On a
 * machine that will not assemble it is refused by name rather than answering
 * with every tree reading as in flight.
 */
const worktrees: PluginCommand<Settings> = {
  name: "worktrees",
  description: "Inspect and tidy the isolated checkouts work runs in",
  mount: true,
  subcommands: [
    {
      name: "list",
      description: "Name every worktree: state, workflow, work id, repo, branch, cleanliness, retention",
      default: true,
      async run({ ports, out }) {
        const manager = managed(ports);
        if (!manager) return out.error("nothing mounted the worktree port");

        const states = await manager.states();
        if (states.length === 0) {
          out.line("no worktrees");
          return;
        }

        const orphaned = states.filter((state) => state.state === "orphaned").length;
        for (const state of states) {
          const clean = state.clean ? "clean" : "dirty";
          const retention = state.retentionEligible ? "past retention" : "held";
          out.line(
            `${state.workId}  ${state.workflow}  ${state.repo}  ${state.branch || "(detached)"}  ` +
              `${state.state}  ${clean}  ${retention}`,
          );
          out.line(`  ${state.path}`);
        }

        if (orphaned > 0) {
          out.line(`\n${orphaned} tree(s) name work the store no longer holds.`);
          out.line("Recover with `amy worktrees remove <workId> --force`, or prune them by hand.");
        }
      },
    },
    {
      name: "remove",
      description: "Remove one worktree, refusing an in-flight or dirty one unless --force",
      args: [{ name: "workId", description: "the work whose tree is to go" }],
      flags: [{ flags: "--force", description: "remove it even though the refusal above applies" }],
      async run({ ports, args, options, out }) {
        const manager = managed(ports);
        if (!manager) return out.error("nothing mounted the worktree port");

        const workId = args[0] ?? "";
        const found = (await manager.states()).filter((state) => state.workId === workId);
        if (found.length === 0) {
          out.error(`no worktree for ${workId}`);
          process.exitCode = 1;
          return;
        }

        let removed = 0;
        for (const state of found) {
          try {
            if (await manager.release(workId, state.repo, { force: options.force === true })) removed += 1;
          } catch (error) {
            out.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
          }
        }

        if (removed > 0) out.line(`removed ${removed} tree(s) for ${workId}`);
      },
    },
    {
      name: "prune",
      description: "Remove every terminal, clean tree past its retention, and nothing else",
      async run({ ports, out }) {
        const manager = managed(ports);
        if (!manager) return out.error("nothing mounted the worktree port");

        const removed = await manager.prune(new Date());
        out.line(removed.length ? `removed ${removed.join(", ")}` : "nothing to prune");
      },
    },
  ],
};

/**
 * The workplace, mounted.
 *
 * The port is mounted unconditionally when this plugin is listed — a port
 * with nothing behind it is a boot refusal, and a directory costs nothing —
 * while the workflows that consume it read it as `Worktree | undefined` and
 * run unchanged when no install listed this plugin.
 */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-file-worktree",
  configSchema,
  commands: [worktrees],
  register(registry, ctx) {
    registry.port("worktree", new WorktreeManager(ctx.runner, settingsFor(ctx)));
  },
});