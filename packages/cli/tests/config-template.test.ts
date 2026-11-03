import { describe, it, expect } from "vitest";
import yaml from "yaml";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigSchema, mount, NodeCommandRunner } from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import { EXAMPLE_CONFIG, machineSchema, loadConfigFrom } from "../src/config.js";
import {
  checkConfigBoots,
  SettingsSurface,
  checkConfigTemplate,
  namesTheExample,
  withExampleWorkflow,
} from "../src/config-template.js";
import { load } from "../src/loader.js";
import { profiles } from "../src/profiles.js";
import { hostPaths, pluginList, pluginSlices } from "../src/slices.js";

const parsed = (): object | undefined => {
  const document = yaml.parseDocument(EXAMPLE_CONFIG);
  return document.errors.length === 0 ? (document.toJS() as object) : {};
};

function surfacesOf(given: object | undefined): SettingsSurface[] {
  return [{ at: "", schema: machineSchema, given }];
}

describe("the config amy init writes", () => {
  // The regression. `agent:` appeared twice, YAML refuses a duplicate key
  // rather than merging it, and every command after `amy init` threw.
  it("parses, so the first command after init is not the last", () => {
    expect(yaml.parseDocument(EXAMPLE_CONFIG).errors).toEqual([]);
  });

  it("carries only settings the machine schema declares, and no workflow's vocabulary", () => {
    expect(checkConfigTemplate(surfacesOf(parsed()), [])).toEqual([]);
  });

  it("names the backoff a poke exists to collapse", () => {
    expect(EXAMPLE_CONFIG).toContain("pollBackoffMs");
  });

  it("points at the command that writes what it no longer ships", () => {
    expect(EXAMPLE_CONFIG).toContain("amy add");
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

  // What a fresh install starts without is the operator's first errand —
  // `amy doctor` says FAIL and names the key — not a fault in the text
  // `amy init` wrote. A credential this machine has not been given yet is
  // stood in for rather than reported as a template bug, and given back below
  // so the next case in this file inherits the machine it was run on.
  const priorKey = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY ??= "lin_api_boot-check";

  try {
    // The same workflow the production check mounts, for the same reason: the
    // template ships its workflows commented out, and the settings under test
    // — the ladder, the budget — only reach a mount once one is named.
    const config = withExampleWorkflow(loadConfigFrom(root, text));
    const profile = profiles(config)[config.defaultWorkflow]!;

    const loaded = await load(pluginList(config, profile));
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

    const outcome = await mount(
      loaded.plugins,
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
    if (priorKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = priorKey;
  }
}

describe("the machine the template describes", () => {
  // The shipped example, assembled against the plugins it names. This is the
  // claim `checkConfigTemplate` could not make: that what `amy init` writes
  // runs — not that the file parses and names every setting.
  it("mounts with no problems", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "amy-boot-"));

    try {
      const boot = await checkConfigBoots(root);

      expect(boot.problems).toEqual([]);
      expect(boot.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The check runs inside `amy doctor` and inside this suite, so it has to be
  // an observation rather than a mutation: the stand-in credential it needs to
  // mount is given back, and a machine that never had the key does not end up
  // holding one.
  it("leaves the environment as it found it", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "amy-boot-env-"));
    const before = process.env.LINEAR_API_KEY;

    try {
      await checkConfigBoots(root);

      expect(process.env.LINEAR_API_KEY).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The transcription's one failure mode. The check mounts a workflow copied
  // out of a comment, so a template that stops offering it has to say so
  // rather than leave the check mounting something nobody is offered.
  it("names the example it mounts, and says so when the template stops", () => {
    expect(namesTheExample(EXAMPLE_CONFIG)).toEqual([]);

    // The rename takes the package name with it, which is the honest count:
    // both words the transcription copied are gone.
    const renamed = namesTheExample(EXAMPLE_CONFIG.replaceAll("ticket-to-qa", "ticket-to-prod"));

    expect(renamed).toHaveLength(2);
    expect(renamed.join("\n")).toContain("@amykit/workflow-ticket-to-qa");
    expect(renamed.join("\n")).toContain("retranscribe");
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
  const schema: ConfigSchema = {
    "policy.pollBackoffMs": { type: "number", default: 1, description: "how long a waiting state holds" },
    "policy.maxGateAttempts": { type: "number", default: 3, description: "how many times the gate may see one change" },
  };
  const surfaces = (): SettingsSurface[] => [{ at: "workflows.example.settings", schema, given: undefined }];

  it("reports a schema setting whose description is missing, naming it", () => {
    const blind: ConfigSchema = {
      "policy.attempts": { type: "number", default: 3, description: "" },
      ...schema,
    };
    const problems = checkConfigTemplate([{ at: "workflows.example.settings", schema: blind, given: undefined }], []);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("workflows.example.settings.policy.attempts");
  });

  it("reports a key the template sets that is not a setting", () => {
    const problems = checkConfigTemplate([{ at: "", schema: machineSchema, given: { pollBackoff: 1 } }], []);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`pollBackoff`");
    expect(problems[0]).toContain("nothing would read it");
  });

  it("reports a template that does not parse, and nothing else", () => {
    const problems = checkConfigTemplate(surfaces(), ["Map keys must be unique"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Map keys must be unique");
    expect(problems[0]).toContain("amy init");
  });

  it("gives nothing for a machine whose every setting is described", () => {
    expect(checkConfigTemplate(surfaces(), [])).toEqual([]);
  });
});
