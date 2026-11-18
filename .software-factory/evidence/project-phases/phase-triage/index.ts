// A work phase as one is written against a project's brief: triage resolves
// the brief under the unit's own id, the one the GROOMED gate judged, and
// records the prompt it built so a run can read what it was asked.
import { briefOf, defineWorkflow, optional, renderBrief, unitOf } from "@amykit/core";
import type { BriefStore } from "@amykit/core";

/** What the last look asked at triage: the prompt the run built. */
let asked = "no triage ran";

export const plugin = defineWorkflow({
  name: "invoices-briefed-triage",
  pluginName: "workflow-invoices-briefed-triage",
  configSchema: {},
  policy: {},
  needs: { brief: optional<BriefStore>() },
  brief: { sections: ["Goal"] },
  phases: { prove: "this fixture proves the prompt triage was asked with, and runs no proving phase" },
  record: () => ({}),
  discover: async () => [],
  observe: async (scope, record) => {
    const unit = unitOf(record);
    const brief = await briefOf(scope.ports.brief, { workId: unit });
    const statement = brief ? renderBrief(brief).text : "no brief";
    asked = `Triage ${unit}: is the work clear against this brief?\n\n${statement}`;
    return {};
  },
  actions: {},
  output: { TRIAGED: () => ({ prompt: asked }) },
  decide: {
    TRIAGE: () => ({ kind: "advance", to: "TRIAGED", effects: [], why: "the prompt is built" }),
    TRIAGED: () => ({ kind: "settled", why: "triage is done" }),
  },
});
