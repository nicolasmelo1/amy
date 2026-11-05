import { describe, it, expect } from "vitest";
import { baseBranchFor } from "../src/git.js";
import { Plugin, PluginContext } from "../src/plugin.js";
import { WORKSPACE_PORT } from "../src/ports/Workspace.js";
import { HostServices, mount } from "../src/mount.js";
import { BRANCH_SETTINGS } from "../src/checkouts.js";

/** The services a host lends every plugin, with nothing that touches a machine. */
const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-10-28T12:00:00.000Z"),
  paths: { state: "/w/.amy" },
};

/** A workplace the mount carries, where the standing checkouts live. */
const workplace = (workspaceRoot = "/w", checkouts: Record<string, string> = {}): Plugin => ({
  name: "@amykit/plugin-workspace",
  register: (registry) => registry.port(WORKSPACE_PORT, { workspaceRoot, checkouts }),
});

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
  const outcome = await mount([workplace("/w", { "acme/api": "/elsewhere/api" }), borrower("@amykit/plugin-a", held)], settings, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return held.ctx!;
}

describe("the checkouts a plugin is lent", () => {
  it("answers the workplace's root and checkout map, wherever they were told to live", async () => {
    const ctx = await lent({});

    expect(ctx.checkouts().layout.workspaceRoot).toBe("/w");
    expect(ctx.checkouts().git.pathFor("acme/api")).toBe("/elsewhere/api");
    expect(ctx.checkouts().git.pathFor("acme/web")).toBe("/w/web");
  });

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
      [workplace(), borrower("@amykit/plugin-a", first), borrower("@amykit/plugin-b", second)],
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

  it("refuses a base branch that is not a branch name, naming the repository", async () => {
    const ctx = await lent({ "@amykit/plugin-a": { baseBranch: { "acme/api": 7 } } });

    expect(() => ctx.checkouts().layout).toThrow("`acme/api`");
  });
});

describe("the workplace the checkouts answer through", () => {
  const refusal = (of: { ok: boolean; problems?: string[] }): string => (of.ok ? "" : (of.problems ?? []).join("; "));

  it("refuses a plugin that asks while registering, naming the plugin and the workspace it needs", async () => {
    const asks: Plugin = {
      name: "@amykit/plugin-a",
      configSchema: { ...BRANCH_SETTINGS },
      register: (_registry, ctx) => {
        void ctx.checkouts().git;
      },
    };

    const outcome = await mount([asks], {}, HOST);

    expect(outcome.ok).toBe(false);
    const said = refusal(outcome);
    expect(said).toMatch(/@amykit\/plugin-a: failed to mount/);
    expect(said).toContain("@amykit/plugin-file-worktree");
  });

  it("holds the answer once taken, so every read sees the same workplace", async () => {
    const held: { ctx?: PluginContext } = {};
    const reader = borrower("@amykit/plugin-a", held, (_registry, ctx) => {
      void ctx.checkouts().layout;
    });
    const outcome = await mount([workplace(), reader], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(baseBranchFor(held.ctx!.checkouts().layout, "acme/api")).toBe("main");
  });

  it("is refused the same way after the mount, while the plugins are running", async () => {
    const held: { ctx?: PluginContext } = {};
    await mount([borrower("@amykit/plugin-a", held)], {}, HOST);

    expect(() => held.ctx!.checkouts().git).toThrow(/nothing mounted a workspace/);
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

    const outcome = await mount([workplace(), caller, worktree], {}, HOST);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(held.git!.pathFor("acme/api", "W-1")).toBe("/trees/W-1/api");
    await expect(held.git!.acquire("acme/api", "W-1")).resolves.toBe("/trees/W-1/api");
  });

  it("leaves the standing checkout in place when nothing mounted one", async () => {
    const ctx = await lent({});

    expect(ctx.checkouts().git.pathFor("acme/api", "W-1")).toBe("/elsewhere/api");
  });
});
