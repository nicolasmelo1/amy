import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_PORT, ConfigOf, OperationContext, PluginContext, Worktree, Workspace, baseBranchesOf, defineOperation, definePlugin, fail, unitOf } from "@amykit/core";
import { z } from "zod";
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

  const workspace = workspaceFor(ctx);
  return {
    root: expandHome(root),
    workflow,
    defaultBranch: ctx.config.defaultBranch,
    baseBranch: baseBranchesOf(ctx.config),
    workspaceRoot: workspace.workspaceRoot,
    checkouts: workspace.checkouts,
    retentionDays: ctx.config.retentionDays,
    // Read on every look, never folded in at mount: a record deleted under a
    // running install turns its tree orphaned at the next list, which is the
    // truth about what the store holds now.
    record: (workId) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(recordsDirectory, `${rootRecordId(workId)}.json`), "utf-8")) as {
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

/** Called pieces live inside their root record, while a worktree remains root-owned. */
function rootRecordId(workId: string): string {
  return unitOf({ id: workId });
}

/**
 * The workplace this slice carries, expanded the way the machine expanded it.
 *
 * The workspace is the plugin's own vocabulary now, so its paths are read off
 * the slice and made absolute here — the one expansion, in the one place that
 * mounts the port every `checkouts()` answer goes through.
 */
function workspaceFor(ctx: TypedContext): Workspace {
  const checkouts = ctx.config.checkouts ?? {};
  return {
    workspaceRoot: expandHome(ctx.config.workspaceRoot),
    checkouts: Object.fromEntries(
      Object.entries(checkouts as Record<string, unknown>).map(([repo, value]) => [repo, expandHome(String(value))]),
    ),
  };
}

/** The port this plugin mounted; the operations below all declare `mount: true`. */
function managed(context: OperationContext): Worktree {
  return context.port("worktree") as Worktree;
}

const tree = z.object({
  workId: z.string().describe("work"),
  workflow: z.string().describe("workflow"),
  repo: z.string().describe("repo"),
  branch: z.string().describe("branch"),
  state: z.enum(["in-flight", "terminal", "orphaned"]).describe("state"),
  tree: z.enum(["clean", "dirty"]).describe("tree"),
  retention: z.enum(["held", "past retention"]).describe("retention"),
  path: z.string().describe("path"),
});

/**
 * The trees, as this plugin's own operations: `amy worktrees`, `amy
 * worktrees remove` and `amy worktrees prune`.
 *
 * `mount: true`, because what a tree is worth removing depends on the
 * workflow's terminal states — a fact only the mounted manager holds. On a
 * machine that will not assemble each is refused by name rather than
 * answering with every tree reading as in flight.
 */
const listTrees = defineOperation({
  id: "worktree.list-trees",
  domain: "worktree",
  summary: "Name every worktree: state, workflow, work id, repo, branch, cleanliness, retention",
  description:
    "Lists every tree the mounted manager holds, with the state of the work it belongs to. An orphaned tree names work the store no longer holds; " +
    "`amy worktrees remove <workId> --force` recovers it. Changes nothing.",
  input: z.object({}),
  output: z.array(tree).describe("worktrees"),
  writes: [],
  mount: true,
  http: { method: "get", path: "/worktrees" },
  cli: { words: ["worktrees", "list"], default: true },
  examples: [{
    summary: "one finished, clean tree",
    input: {},
    output: [{
      workId: "tickets/ACME-1",
      workflow: "tickets",
      repo: "acme/api",
      branch: "acme-1-fix",
      state: "terminal",
      tree: "clean",
      retention: "past retention",
      path: "/home/amy/worktrees/tickets/ACME-1/api",
    }],
  }],
  async handler(_input, context) {
    const states = await managed(context).states();
    return states.map((state) => ({
      workId: state.workId,
      workflow: state.workflow,
      repo: state.repo,
      branch: state.branch || "(detached)",
      state: state.state,
      tree: state.clean ? "clean" as const : "dirty" as const,
      retention: state.retentionEligible ? "past retention" as const : "held" as const,
      path: state.path,
    }));
  },
});

const removeTree = defineOperation({
  id: "worktree.remove-tree",
  domain: "worktree",
  summary: "Remove one worktree, refusing an in-flight or dirty one unless --force",
  description: "Removes every tree the named work holds. An in-flight or dirty tree is refused unless `force` says otherwise; nothing else is touched.",
  input: z.object({
    workId: z.string().describe("the work whose tree is to go"),
    force: z.boolean().default(false).describe("remove it even though the refusal applies"),
  }),
  output: z.object({ removed: z.number().int().describe("removed") }),
  errors: {
    "worktree.not_found": { description: "no tree belongs to the work named" },
    "worktree.refused": { description: "the tree is in flight or dirty, and force was not given" },
  },
  writes: ["worktree"],
  mount: true,
  http: { method: "delete", path: "/worktrees/{workId}" },
  cli: { words: ["worktrees", "remove"], positional: ["workId"] },
  examples: [{ summary: "a finished tree", input: { workId: "tickets/ACME-1" }, output: { removed: 1 } }],
  async handler({ workId, force }, context) {
    const manager = managed(context);
    const found = (await manager.states()).filter((state) => state.workId === workId);
    if (found.length === 0) return fail("worktree.not_found", `no worktree for ${workId}`);

    // The safety refusal is read from the trees' own states, so it is the one
    // failure answered as declared; anything `release` throws past it — a
    // broken checkout, a git that failed — is not a refusal, and propagates.
    const refusals = force ? [] : found.filter((state) => state.state === "in-flight" || !state.clean);
    if (refusals.length > 0) {
      const why = refusals.map((state) => `${state.path} is ${state.state === "in-flight" ? "still in flight" : "dirty"}`).join("; ");
      return fail("worktree.refused", `refusing to remove the tree(s) for ${workId}: ${why} (use --force to remove them anyway)`);
    }

    let removed = 0;
    for (const state of found) {
      if (await manager.release(workId, state.repo, { force })) removed += 1;
    }
    return { removed };
  },
});

const pruneTrees = defineOperation({
  id: "worktree.prune-trees",
  domain: "worktree",
  summary: "Remove every terminal, clean tree past its retention, and nothing else",
  description: "Removes the trees an automatic prune may remove: terminal, clean and past retention. A dirty, in-flight or orphaned tree is left where it is.",
  input: z.object({}),
  output: z.object({ removed: z.array(z.string()).describe("removed") }),
  writes: ["worktree"],
  mount: true,
  http: { method: "post", path: "/worktrees/prune" },
  cli: { words: ["worktrees", "prune"] },
  examples: [{ summary: "nothing past retention", input: {}, output: { removed: [] } }],
  async handler(_input, context) {
    return { removed: await managed(context).prune(new Date()) };
  },
});

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
  operations: [listTrees, removeTree, pruneTrees],
  register(registry, ctx) {
    registry.port(WORKSPACE_PORT, workspaceFor(ctx));
    registry.port("worktree", new WorktreeManager(ctx.runner, settingsFor(ctx)));
  },
});