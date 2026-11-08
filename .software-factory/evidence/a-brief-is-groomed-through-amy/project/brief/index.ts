// A brief phase as somebody writes one: four sections, in the order grooming
// asks them, and the check that says when a brief answering them is ready.
// Its walk settles at once; what the gate proves is the brief, not the walk.
import { defineWorkflow } from "@amykit/core";

type Brief = { readonly sections: readonly { readonly name: string; readonly body: string }[] };

const lines = (brief: Brief, name: string): string[] =>
  (brief.sections.find((section) => section.name === name)?.body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

export const plugin = defineWorkflow({
  name: "invoices-brief",
  pluginName: "workflow-invoices-brief",
  configSchema: {},
  policy: {},
  needs: {},
  phases: { prove: "a person reads the invoice before it ships" },
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  output: { BRIEFED: () => ({ criteria: [] }) },
  decide: { BRIEFED: () => ({ kind: "settled", why: "the brief is settled" }) },
  brief: {
    sections: ["Goal", "Sources", "Criteria", "Out of scope"],
    check(brief: Brief) {
      const refusals: { section: string; rule: string }[] = [];
      const sources = new Set<string>();
      for (const line of lines(brief, "Sources")) {
        const id = /^(S\d+): \S/.exec(line)?.[1];
        if (id === undefined) refusals.push({ section: "Sources", rule: `\`${line}\` is not \`S<n>: where it comes from\`` });
        else sources.add(id);
      }
      for (const line of lines(brief, "Criteria")) {
        const cited = /\(source: (S\d+)\)$/.exec(line)?.[1];
        if (cited === undefined) refusals.push({ section: "Criteria", rule: `\`${line}\` names no source: end it with \`(source: S<n>)\`` });
        else if (!sources.has(cited)) refusals.push({ section: "Criteria", rule: `\`${line}\` cites ${cited}, which Sources does not list` });
      }
      return refusals;
    },
  },
});
