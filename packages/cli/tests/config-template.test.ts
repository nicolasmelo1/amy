import { describe, it, expect } from "vitest";
import yaml from "yaml";
import { DEFAULT_POLICY as ERRAND_POLICY } from "@amykit/workflow-errand";
import { DEFAULT_POLICY as PLAN_POLICY } from "@amykit/workflow-note-to-plan";
import { DEFAULT_POLICY as TICKET_POLICY } from "@amykit/workflow-ticket-to-qa";
import { DEFAULT_CONFIG, EXAMPLE_CONFIG } from "../src/config.js";
import { SettingsSurface, checkConfigTemplate } from "../src/config-template.js";

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
