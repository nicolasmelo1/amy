import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AmyConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Profile } from "../src/profiles.js";
import { pluginSlices } from "../src/slices.js";

/** The falsifier this property must reject, planted only when the rule names it. */
const FALSIFIER = "machine_key_leaks_into_a_slice";
const leaks = process.env.SF_FALSIFIER === FALSIFIER;
void leaks;

/** The workflow these tests mount, named the way a config names it. */
const TICKETS: Profile = {
  name: "tickets",
  workflow: "@amykit/workflow-ticket-to-qa",
  plugins: [],
  takesNotes: false,
  takesTasks: false,
  settings: {},
};

/** A word only the machine's own keys would carry, so a leak is visible by itself. */
const staleWord = fc.stringMatching(/[A-Z][a-z]{9,13}/);

/** A config in the new shape, plus the stale file a pre-move install had. */
const install = fc.record({
  pluginsRepos: fc.array(fc.stringMatching(/[a-z]{4,9}\/[a-z]{4,9}[0-9]/), { minLength: 0, maxLength: 3 }),
  sliceBranch: fc.stringMatching(/[a-z][a-z-]{3,9}/),
  givenLinear: fc.option(fc.stringMatching(/[a-z]{4,9}/), { nil: undefined }),
  profileStatus: fc.option(fc.stringMatching(/[A-Za-z ]{5,14}/), { nil: undefined }),
});

describe("the machine's keys never leak into a slice", () => {
  it("hands no plugin a repository, branch or gate the workspace's own slices do not carry", () => {
    const property = fc.property(
      staleWord,
      staleWord,
      staleWord,
      staleWord,
      install,
      (staleWorkspaceRoot, staleDefaultBranch, staleGateCommand, staleWorktreeRoot, machine) => {
        // Seven machine keys, written the way a stale install had them: the
        // vocabulary the workspace owns, which nothing reads from the top
        // level any more. The tokens are words the slices never carry, so a
        // value that appears in a derived slice came from a slice.
        const stale = {
          repos: ["Qapabilities/Widgets123"],
          workspaceRoot: `/${staleWorkspaceRoot}`,
          checkouts: { "Qapabilities/Widgets123": `/${staleWorkspaceRoot}own` },
          defaultBranch: staleDefaultBranch,
          baseBranch: { "Qapabilities/Widgets123": `${staleDefaultBranch}base` },
          gate: { default: [`${staleGateCommand} test`] },
          worktrees: { root: `/${staleWorktreeRoot}`, retentionDays: 7 },
        };
        const config: AmyConfig = {
          ...DEFAULT_CONFIG,
          workflows: {
            tickets: {
              workflow: "@amykit/workflow-ticket-to-qa",
              ...(machine.profileStatus !== undefined ? { settings: { qaStatusName: machine.profileStatus } } : {}),
            },
          },
          plugins: {
            "@amykit/plugin-file-worktree": { repos: machine.pluginsRepos, defaultBranch: machine.sliceBranch },
            ...(machine.givenLinear !== undefined ? { "@amykit/plugin-linear": { endpoint: machine.givenLinear } } : {}),
          },
        };

        // The stale keys are handed to the real derivation, at the top level
        // where an old install wrote them: a host that forwarded any of them
        // into a slice is what this property exists to catch. When the
        // falsifier is planted, the derivation reads them the way the old
        // host did, and the property refutes.
        const fed = { ...config, ...stale } as unknown as AmyConfig;
        const derived = leaks ? leaky(fed, stale) : pluginSlices(fed, TICKETS);
        const dumped = JSON.stringify(derived);
        const tokens = [
          ...stale.repos,
          stale.workspaceRoot,
          ...Object.values(stale.checkouts),
          stale.defaultBranch,
          ...Object.values(stale.baseBranch),
          ...Object.values(stale.gate).flat(),
          stale.worktrees.root,
        ];

        for (const token of tokens) {
          expect(dumped, `a slice carries the machine's own ${token}`).not.toContain(token);
        }
      },
    );

    fc.assert(property, { numRuns: 200 });
  });
});

/** The old host, planted under SF_FALSIFIER: it read the machine's own keys. */
function leaky(config: AmyConfig, stale: Record<string, unknown>): Record<string, unknown> {
  void config;
  return {
    "@amykit/workflow-errand": { repos: stale.repos, defaultBranch: stale.defaultBranch, baseBranch: stale.baseBranch },
    "@amykit/plugin-linear": { defaultRepo: (stale.repos as string[])[0] ?? "" },
    "@amykit/plugin-command-gate": { defaultBranch: stale.defaultBranch, baseBranch: stale.baseBranch, gate: stale.gate },
    "@amykit/plugin-file-worktree": {
      root: (stale.worktrees as { root: string }).root,
      workspaceRoot: stale.workspaceRoot,
      checkouts: stale.checkouts,
    },
  };
}

describe("the property can fail", () => {
  it("names the mutation it rejects", () => {
    // A property is a proof a plan cites only when it can fail: the rule
    // that runs it plants the mutation this file carries and refuses the
    // property if it still passes.
    expect(FALSIFIER).toBe("machine_key_leaks_into_a_slice");
  });
});
