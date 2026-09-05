import yaml from "yaml";
import { read, readIfPresent } from "../lib/repo.mjs";

/**
 * The gates and rules this repository holds itself to.
 *
 * Read from the policy the tool enforces rather than from prose about it, so
 * a rule somebody turns off cannot go on being documented as enforced. The
 * reasoning behind each rule stays in `docs/rules.md`, which `sf` itself
 * generates and `L4.EVERY_RULE_HAS_A_WHY` keeps in step.
 */
export function factoryFacts() {
  const text = read(".software-factory/policy.yaml");
  const policy = yaml.parse(text) ?? {};
  const annotations = annotationsIn(text);

  const rules = rulesIn(policy).map((rule) => ({ ...rule, ...(annotations[rule.id] ?? {}) }));

  return {
    gates: gatesIn(policy),
    rules,
    disabled: rules.filter((rule) => !rule.enabled),
  };
}

/**
 * The title above each rule and the reason under a disabled one.
 *
 * Both are YAML comments, which a parser throws away, and both are the only
 * place the decision is written down. A page that listed three disabled rules
 * without saying why would be the exact shape of documentation this
 * repository refuses everywhere else.
 */
function annotationsIn(text) {
  const found = {};
  const lines = text.split("\n");

  for (const [index, line] of lines.entries()) {
    const rule = /^ {2}(L\d\.[A-Z0-9_]+):\s*$/.exec(line);
    if (!rule) continue;

    // Anchored with no optional whitespace runs beside each other: a lazy
    // pattern here is one an adversarial policy file could make backtrack.
    const above = /^ {2}# (?:L\d [—-] )?(.+)$/.exec(lines[index - 1] ?? "");
    found[rule[1]] = { title: above ? above[1].trim() : "", reason: reasonUnder(lines, index) };
  }

  return found;
}

/** The comment block between a rule's name and its first setting. */
function reasonUnder(lines, index) {
  const collected = [];

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const comment = /^ {4}#\s?(.*)$/.exec(lines[cursor]);
    if (!comment) break;
    collected.push(comment[1].trim());
  }

  return collected.join(" ").replace(/^Disabled:\s*/i, "").trim();
}

function gatesIn(policy) {
  return Object.entries(policy.gates ?? {})
    .map(([name, gate]) => ({
      name,
      activation: gate.activation ?? [],
      evidence: gate.evidence ?? "",
      plan: gate.plan ?? "",
      assertions: gate.required_assertions ?? [],
      scenario: scenarioFor(gate.evidence),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The script that produces a gate's evidence, beside the evidence itself. */
function scenarioFor(evidence) {
  if (!evidence) return "";

  const scenario = evidence.replace(/\.json$/, "-scenario.sh");
  return readIfPresent(scenario) === null ? "" : scenario;
}

/**
 * Which rules are on, taken from wherever the policy says so.
 *
 * The policy file's shape is the tool's, not this repository's, so both the
 * mapping form and the list form are read: a policy that switches between
 * them should change the count in the docs, not silently render nothing.
 */
function rulesIn(policy) {
  const declared = policy.rules ?? {};

  if (Array.isArray(declared)) {
    return declared.map((rule) => ({ id: String(rule), enabled: true, settings: {} })).sort(byId);
  }

  return Object.entries(declared)
    .map(([id, value]) => ({
      id,
      enabled: value?.enabled !== false,
      settings: settingsOf(value),
    }))
    .sort(byId);
}

function settingsOf(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  const settings = {};
  for (const [key, setting] of Object.entries(value)) {
    if (key === "enabled" || key === "reason" || key === "why") continue;
    settings[key] = setting;
  }

  return settings;
}


function byId(a, b) {
  return a.id.localeCompare(b.id);
}
