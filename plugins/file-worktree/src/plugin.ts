import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Plugin, PluginContext } from "@amykit/core";
import { configSchema } from "./config.js";
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
function settingsFor(ctx: PluginContext): WorktreeManagerConfig {
  // The CLI always derives this from the selected profile. The neutral docs
  // mount has no selected workflow, so it receives a harmless label solely to
  // enumerate the port rather than refusing documentation generation.
  const workflow = (ctx.config.workflow as string) || "unconfigured";

  const root = (ctx.config.root as string) || path.join(ctx.paths.state, "worktrees");

  return {
    root: expandHome(root),
    workflow,
    defaultBranch: ctx.config.defaultBranch as string,
    workspaceRoot: ctx.paths.workspace,
    retentionDays: ctx.config.retentionDays as number,
    // Read on every look, never folded in at mount: a record deleted under a
    // running install turns its tree orphaned at the next list, which is the
    // truth about what the store holds now.
    record: (workId) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(ctx.paths.state, "records", `${workId}.json`), "utf-8")) as {
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

/**
 * The workplace, mounted.
 *
 * The port is mounted unconditionally when this plugin is listed — a port
 * with nothing behind it is a boot refusal, and a directory costs nothing —
 * while the workflows that consume it read it as `Worktree | undefined` and
 * run unchanged when no install listed this plugin.
 */
export const plugin: Plugin = {
  name: "@amykit/plugin-file-worktree",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.port("worktree", new WorktreeManager(ctx.runner, settingsFor(ctx)));
  },
};