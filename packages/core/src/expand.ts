import { callPath } from "./calls.js";
import { DIAGRAM_CLASSES, Diagram } from "./diagram.js";
import { Workflow } from "./plugin.js";
import { WorkRecord } from "./work.js";

/**
 * A workflow's diagram with every call drawn as what it calls: a Mermaid
 * composite state, `state REVIEW { … }`, holding the callee's own diagram.
 *
 * For reading only. It is valid Mermaid and renders wherever the file does,
 * but the source subset still refuses a composite state: a source file holds
 * one workflow, and a call holds the rest. Inner states are named after the
 * call state they sit in (`REVIEW__FIX`), so two workflows that both have a
 * `DONE` draw two states. Given a record, the state it is in at every depth
 * is marked.
 */
export function expandDiagram(workflow: Workflow, record?: WorkRecord): string {
  const diagram = drawnOf(workflow);
  const lines = [diagram.text.replace(/\s*$/, "")];
  const classes: string[] = [];
  for (const state of diagram.calls) {
    const callee = workflow.calls?.[state];
    if (callee) lines.push("", ...composite(state, callee, "    ", classes));
  }
  lines.push(...classes);
  const marked = record ? markedPath(workflow, record) : [];
  if (marked.length > 0) {
    lines.push("", "    classDef current stroke-width:3px,font-weight:bold", `    class ${marked.join(",")} current`);
  }
  return `${lines.join("\n")}\n`;
}

function drawnOf(workflow: Workflow): Diagram {
  if (!workflow.diagram) throw new Error(`${workflow.name} has no diagram to expand: its states are declared in its code`);
  return workflow.diagram;
}

function composite(prefix: string, callee: Workflow, indent: string, classes: string[]): string[] {
  const diagram = drawnOf(callee);
  const id = (state: string): string => `${prefix}__${state}`;
  const inner = `${indent}    `;
  const lines = [`${indent}state ${prefix} {`];
  for (const state of diagram.states) lines.push(`${inner}state "${diagram.labels[state] ?? state}" as ${id(state)}`);
  lines.push(`${inner}[*] --> ${id(diagram.initial)}`);
  for (const edge of diagram.transitions) lines.push(`${inner}${id(edge.from)} --> ${id(edge.to)}${edge.label ? `: ${edge.label}` : ""}`);
  for (const state of diagram.terminal) lines.push(`${inner}${id(state)} --> [*]`);
  for (const state of diagram.calls) {
    const called = callee.calls?.[state];
    if (called) lines.push(...composite(id(state), called, inner, classes));
  }
  lines.push(`${indent}}`);
  // Outside the block, where a class line is read for any state it names.
  for (const name of DIAGRAM_CLASSES) {
    const states = diagram[name === "call" ? "calls" : name];
    if (states.length > 0) classes.push(`    class ${states.map(id).join(",")} ${name}`);
  }
  return lines;
}

/** The id the record is drawn at, at every depth of its call path. */
function markedPath(workflow: Workflow, record: WorkRecord): string[] {
  const ids: string[] = [];
  let prefix = "";
  let at: Workflow | undefined = workflow;
  for (const step of callPath(record)) {
    if (!at) break;
    const id = prefix ? `${prefix}__${step.state}` : step.state;
    ids.push(id);
    at = at.calls?.[step.state];
    prefix = id;
  }
  return ids;
}
