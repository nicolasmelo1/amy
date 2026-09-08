import { describe, it, expect } from "vitest";
import yaml from "yaml";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mount, NodeCommandRunner } from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import { DEFAULT_POLICY as ERRAND_POLICY } from "@amykit/workflow-errand";
import { DEFAULT_POLICY as PLAN_POLICY } from "@amykit/workflow-note-to-plan";
import { DEFAULT_POLICY as TICKET_POLICY, Roster } from "@amykit/workflow-ticket-to-qa";
import { DEFAULT_CONFIG, EXAMPLE_CONFIG, loadConfigFrom } from "../src/config.js";
import { checkConfigBoots, SettingsSurface, checkConfigTemplate } from "../src/config-template.js";
import { hostPlugin } from "../src/hostPlugin.js";
import { load } from "../src/loader.js";
import { profiles } from "../src/profiles.js";
import { hostPaths, pluginList, pluginSlices } from "../src/slices.js";

interface TemplateShape {
  policy?: object;
  plans?: { policy?: object };
  errands?: { policy?: object };
}

const parsed = (): TemplateShape => yaml.parse(EXAMPLE_CONFIG) as TemplateShape;

function surfacesOf(config: TemplateShape): SettingsSurface[] {
  return [
    { at: "", accepts: DEFAULT_CONFIG, given: config },
    { at: "policy", accepts: TICKET_POLICY, given: config.policy },
    { at: "plans.policy", accepts: PLAN_POLICY, given: config.plans?.policy },
    { at: "errands.policy", accepts: ERRAND_POLICY, given: config.errands?.policy },
  ];
}

describe("the config amy init writes", () => {
  // The regression. `agent:` appeared twice, YAML refuses a duplicate key
  // rather than merging it, and every command after `amy init` threw.
  it("parses, so the first command after init is not the last", () => {
    expect(yaml.parseDocument(EXAMPLE_CONFIG).errors).toEqual([]);
  });

  it("sets no key that nothing reads, and names every setting there is", () => {
    expect(checkConfigTemplate(EXAMPLE_CONFIG, surfacesOf(parsed()), [])).toEqual([]);
  });

  it("names the backoff a poke exists to collapse", () => {
    expect(EXAMPLE_CONFIG).toContain("pollBackoffMs");
  });
});

/**
 * The boot half, against the real plugins, over a text the caller controls.
 *
 * `checkConfigBoots` reads the shipped constant; the negative cases need the
 * same assembly over a mutated one. One duplication, deliberate: going
 * through the production function would mean production growing a second
 * entry point that only a test ever passes text to.
 */
async function assembleTemplate(text: string): Promise<{ ok: boolean; problems: string[] }> {
  const root = mkdtempSync(path.join(os.tmpdir(), "amy-template-"));
  const state = mkdtempSync(path.join(os.tmpdir(), "amy-template-state-"));

  try {
    // What a fresh install starts without is the operator's first errand —
    // `amy doctor` says FAIL and names the key — not a fault in the text
    // `amy init` wrote. A credential this machine has not been given yet is
    // stood in for rather than reported as a template bug.
    process.env.LINEAR_API_KEY ??= "lin_api_boot-check";

    const config = loadConfigFrom(root, text);
    const profile = profiles(config)[config.defaultWorkflow] ?? Object.values(profiles(config))[0]!;

    const loaded = await load(pluginList(config, profile));
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

    // The roster `amy init` writes beside the config, handed over unread:
    // this check mounts the machine, it does not judge the roster.
    const roster: Roster = {
      confirmedOn: "1970-01-01",
      reviewers: [],
      qa: { tracker: "", host: "", available: false },
    };

    const outcome = await mount(
      [...loaded.plugins, hostPlugin(() => roster)],
      pluginSlices(config, profile),
      {
        runner: new NodeCommandRunner(),
        now: () => new Date(),
        log: new FileEventLog(path.join(state, "events"), () => new Date()),
        paths: hostPaths(config, state),
      },
    );

    return outcome.ok ? { ok: true, problems: [] } : { ok: false, problems: outcome.problems };
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  }
}

describe("the machine the template describes", () => {
  // The shipped example, assembled against the plugins it names. This is the
  // claim `checkConfigTemplate` could not make: that what `amy init` writes
  // runs — not that the file parses and names every setting.
  it("mounts with no problems", async () => {
    const boot = await checkConfigBoots(mkdtempSync(path.join(os.tmpdir(), "amy-boot-")));

    expect(boot.problems).toEqual([]);
    expect(boot.ok).toBe(true);
  });

  it("turns red when the template's own budget window is one nothing meters", async () => {
    // The shape a rename across packages takes: a window this build's relay
    // has never heard of. Parsed, named, well-formed — and refused at mount.
    const boot = await assembleTemplate(EXAMPLE_CONFIG.replace("perFiveHours", "perDay"));

    expect(boot.ok).toBe(false);
    expect(boot.problems.join("\n")).toContain("perDay");
  });

  it("turns red when the ladder names a harness nothing contributes", async () => {
    // A harness name is a mount decision — naming `claude` is what mounts
    // the claude plugin's rungs — so a harness that is not one is refused
    // rather than quietly dropped, ladder shorter than the operator believes.
    const boot = await assembleTemplate(EXAMPLE_CONFIG.replace("claude:sonnet", "clade:sonnet"));

    expect(boot.ok).toBe(false);
    expect(boot.problems.join("\n")).toContain("clade:sonnet");
  });
});

describe("checkConfigTemplate", () => {
  const surface = (given: object): SettingsSurface[] => [
    { at: "policy", accepts: { pollBackoffMs: 1, maxGateAttempts: 3 }, given },
  ];

  it("reports a setting the template never names", () => {
    const problems = checkConfigTemplate("maxGateAttempts: 3", surface({ maxGateAttempts: 3 }), []);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("policy.pollBackoffMs");
    expect(problems[0]).toContain("nobody can find it");
  });

  it("reports a key the template sets that is not a setting", () => {
    const template = "pollBackoffMs: 1\nmaxGateAttempts: 3\npollBackoff: 1";
    const problems = checkConfigTemplate(template, surface({ pollBackoff: 1 }), []);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("policy.pollBackoff`");
    expect(problems[0]).toContain("nothing would read it");
  });

  it("reports a template that does not parse, and nothing else", () => {
    const problems = checkConfigTemplate("", surface({}), ["Map keys must be unique"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Map keys must be unique");
    expect(problems[0]).toContain("amy init");
  });

  it("counts a setting that is only commented out as named", () => {
    const template = "# pollBackoffMs: 300000 — how long a waiting state holds\nmaxGateAttempts: 3";

    expect(checkConfigTemplate(template, surface({ maxGateAttempts: 3 }), [])).toEqual([]);
  });
});