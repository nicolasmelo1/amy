import { describe, it, expect } from "vitest";
import { baseBranchFor } from "../src/git.js";
import { Plugin, PluginContext } from "../src/plugin.js";
import { HostServices, mount } from "../src/mount.js";
import { BRANCH_SETTINGS } from "../src/checkouts.js";

/** The services a host lends every plugin, with nothing that touches a machine. */
const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-28T12:00:00.000Z"),
  paths: { workspace: "/w", checkouts: { "acme/api": "/elsewhere/api" }, state: "/w/.amy" },
};

/** A plugin that keeps the context it was lent, declaring the shared branch settings. */
function borrower(name: string, into: { ctx?: PluginContext }, register?: Plugin["register"]): Plugin {
  return {
    name,
    configSchema: { ...BRANCH_SETTINGS },
    register: (registry, ctx) => {
      into.ctx = ctx;
      return register?.(registry, ctx);
    },
  };
}

async function lent(settings: Record<string, unknown>): Promise<PluginContext> {
  const held: { ctx?: PluginContext } = {};
  const outcome = await mount([borrower("@amykit/plugin-a", held)], settings, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return held.ctx!;
}

describe("the checkouts a plugin is lent", () => {
  it("answers a repository its own baseBranch named with that branch", async () => {
    const ctx = await lent({ "@amykit/plugin-a": { defaultBranch: "develop", baseBranch: { "acme/api": "trunk" } } });

    expect(baseBranchFor(ctx.checkouts().layout, "acme/api")).toBe("trunk");
  });

  it("falls back to its defaultBranch for a repository its baseBranch did not name", async () => {
    const ctx = await lent({ "@amykit/plugin-a": { defaultBranch: "develop", baseBranch: { "acme/api": "trunk" } } });

    expect(baseBranchFor(ctx.checkouts().layout, "acme/web")).toBe("develop");
  });

  it("reads the calling plugin's settings, not another plugin's", async () => {
    const first: { ctx?: PluginContext } = {};
    const second: { ctx?: PluginContext } = {};
    const outcome = await mount(
      [borrower("@amykit/plugin-a", first), borrower("@amykit/plugin-b", second)],
      { "@amykit/plugin-a": { baseBranch: { "acme/api": "trunk" } }, "@amykit/plugin-b": { defaultBranch: "develop" } },
      HOST,
    );
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(baseBranchFor(first.ctx!.checkouts().layout, "acme/api")).toBe("trunk");
    expect(baseBranchFor(second.ctx!.checkouts().layout, "acme/api")).toBe("develop");
  });

  it("is the shared default branch when the plugin named nothing", async () => {
    const ctx = await lent({});

    expect(baseBranchFor(ctx.checkouts().layout, "acme/api")).toBe("main");
  });

  it("finds a checkout where the host's paths put it", async () => {
    const ctx = await lent({});

    expect(ctx.checkouts().git.pathFor("acme/api")).toBe("/elsewhere/api");
    expect(ctx.checkouts().git.pathFor("acme/web")).toBe("/w/web");
  });

  it("refuses a base branch that is not a branch name, naming the repository", async () => {
    const ctx = await lent({ "@amykit/plugin-a": { baseBranch: { "acme/api": 7 } } });

    expect(() => ctx.checkouts()).toThrow("`acme/api`");
  });
});

describe("the worktree behind a lent checkout", () => {
  const tree = { acquire: async () => "/trees/W-1/api", pathFor: () => "/trees/W-1/api" };

  it("is the one a plugin listed after the caller mounted, even when the caller asked while registering", async () => {
    const held: { git?: ReturnType<PluginContext["checkouts"]>["git"] } = {};
    const caller = borrower("@amykit/plugin-a", {}, (_registry, ctx) => {
      held.git = ctx.checkouts().git;
    });
    const worktree: Plugin = { name: "@amykit/plugin-trees", register: (registry) => registry.port("worktree", tree) };

    const outcome = await mount([caller, worktree], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(held.git!.pathFor("acme/api", "W-1")).toBe("/trees/W-1/api");
    await expect(held.git!.acquire("acme/api", "W-1")).resolves.toBe("/trees/W-1/api");
  });

  it("leaves the standing checkout in place when nothing mounted one", async () => {
    const ctx = await lent({});

    expect(ctx.checkouts().git.pathFor("acme/api", "W-1")).toBe("/elsewhere/api");
  });
});
