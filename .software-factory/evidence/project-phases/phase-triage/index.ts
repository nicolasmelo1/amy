// A work phase as a project calls one: the shipped ticket-to-qa, unchanged.
// It resolves its own brief through the brief port the project mounts, so a
// run of this phase proves the product's read rather than a stand-in's. Two
// declarations are narrowed to this project: the brief section its GROOMED
// gate judges, and the proving phase the project does not have. Its own
// "no brief phase" note is about the walk it runs alone, and is dropped.
import fs from "node:fs";
import { withDiagram } from "@amykit/core";
import { plugin as shipped } from "@amykit/workflow-ticket-to-qa";

const diagram = fs.readFileSync(new URL("./shipped.mmd", import.meta.url), "utf-8");
const phase = withDiagram(shipped, diagram, "the shipped workflow's own diagram") as unknown as {
  brief?: { sections: readonly string[] };
};

// The section this project's GROOMED gate judges. The workflow reads the brief
// itself; naming the section is the project's declaration, not a stand-in's.
phase.brief = { sections: ["Goal"] };

export const plugin = phase;
