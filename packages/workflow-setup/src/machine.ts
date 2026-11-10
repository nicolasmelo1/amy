import { Ask, ConfigField, ConfigSchema, Plan, advance, settled, wait } from "@amykit/core";
import { flagFor, fieldOf, fieldsOf, harnessAsk, channelsAsk, parseSetting, recordFieldIn, settingsPost, workflowAsk } from "./asks.js";
import { channelsIn, given, harnessIn, pluginInHand, workflowIn } from "./answers.js";
import type { Observation, Policy } from "./observation.js";
import { failed } from "./ports/result.js";
import type { CheckFinding } from "./ports/Checks.js";
import type { Result } from "./ports/result.js";
import type { Configuring, PendingAsk, SettingValue, SetupRecord } from "./record.js";

/** The package that contributes this workflow, which the setup profile names. */
const SETUP_WORKFLOW = "@amykit/workflow-setup";

export type SetupState =
  | "DETECTING"
  | "HARNESS"
  | "PLUGIN_INSTALLED"
  | "PINGED"
  | "WORKFLOW"
  | "CHANNELS"
  | "CONFIGURING"
  | "CHECKED"
  | "DONE"
  | "STOPPED";

/** Every port call the walk can make. Nothing here touches a terminal: the conversation port is how the person is reached. */
export type Effect =
  | { type: "read-config" }
  | { type: "write-setup-profile"; workflow: string }
  | { type: "install"; spec: string }
  | { type: "write-ladder"; harness: string }
  | { type: "setup"; plugin: string }
  | { type: "ping"; plugin: string }
  | { type: "write-workflow"; name: string; plugin: string }
  | { type: "post"; ask: Ask }
  | { type: "ask-setting"; plugin: string; field: string; text: string }
  | { type: "write-settings"; plugin: string; values: Readonly<Record<string, SettingValue>> }
  | { type: "check"; plugin: string }
  | { type: "pending"; ask: PendingAsk };

/** STOPPED, by name, so every stop spells the state the diagram draws. */
const STOPPED: SetupState = "STOPPED";

type Decision = (record: SetupRecord, obs: Observation, policy: Policy) => Plan;

/**
 * One decision per drawn state.
 *
 * Pure on purpose: every branch is a predicate over the record and the
 * observation, so the whole walk can be driven in a test without npm, a
 * filesystem or a terminal. A step's result is judged here the look after
 * the step ran, from the `steps` the fold kept — a refused or failed step
 * stops the walk naming why, and no state ever mistakes an unread config
 * for an empty one.
 */
export const decide = {
  DETECTING: planDetecting,
  HARNESS: planHarness,
  PLUGIN_INSTALLED: planInstalled,
  PINGED: planPinged,
  WORKFLOW: planWorkflow,
  CHANNELS: planChannels,
  CONFIGURING: planConfiguring,
  CHECKED: planChecked,
  DONE: () => settled("the machine is set up, and the walk is over"),
  STOPPED: () => settled("the walk stopped; the record says why"),
} satisfies Record<SetupState, Decision>;

/**
 * DETECTING reads what the machine already says and makes sure the setup
 * profile is mounted, so no ask offers a default the file did not really
 * give and the next `amy setup` mounts where this one did.
 */
function planDetecting(record: SetupRecord, obs: Observation, _policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const read = step(record, "config");
  if (failed(read)) return advance(STOPPED, read.why); // never read as nothing set
  if (!read) return act("read what the machine already says", { type: "read-config" });
  const profile = step<void>(record, "profile");
  if (failed(profile)) return advance(STOPPED, profile.why); // an internal error, not a refusal
  // The profile is written only once this is a walk the machine will answer:
  // with no conversation mounted and no flag having answered anything, the
  // walk stops at its first ask having configured nothing, and a profile
  // written ahead of that would leave a config.yaml no walk earned (A7).
  const engaged =
    obs.asks ||
    harnessIn(record, obs) !== undefined ||
    workflowIn(record, obs) !== undefined ||
    channelsIn(record, obs) !== undefined ||
    given(record).plugin !== undefined;
  if (!profile && engaged) return act("make sure the setup profile is mounted", { type: "write-setup-profile", workflow: SETUP_WORKFLOW });
  return advance("HARNESS", "the machine was read and setup mounts in its own profile");
}

/**
 * HARNESS asks the first question — which harness — installs only the one
 * chosen, and writes its ladder. The ask is never posted when a flag
 * answered it first.
 */
function planHarness(record: SetupRecord, obs: Observation, policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const answered = harnessIn(record, obs);
  if (answered) {
    const install = step<void>(record, `install:${answered.plugin}`);
    if (failed(install)) return advance(STOPPED, install.why);
    if (!install) return act(`install the ${answered.name} harness`, { type: "install", spec: answered.plugin });
    const ladder = step<void>(record, "ladder");
    if (failed(ladder)) return advance(STOPPED, ladder.why);
    if (!ladder) return act(`write the ${answered.name} ladder`, { type: "write-ladder", harness: answered.name });
    return advance("PLUGIN_INSTALLED", `the ${answered.name} harness is installed and its ladder written`);
  }
  return ask(record, obs, policy, harnessAsk(obs.harnesses, currentHarness(record)));
}

/** The harness the machine's ladder already names, when it names one. */
function currentHarness(record: SetupRecord): string | undefined {
  const first = record.machine?.ladder[0];
  return first === undefined ? undefined : first.split(":")[0];
}

/**
 * PLUGIN_INSTALLED runs the installed plugin's setup. A record scoped to
 * one plugin starts here — `amy setup slack` — so it reads the machine and
 * installs its plugin first, then joins the walk this state shares with the
 * harness path. It reads the config here rather than in DETECTING (a state
 * it never entered) and leaves the setup profile alone: the profile is what
 * mounted this walk.
 */
function planInstalled(record: SetupRecord, _obs: Observation, _policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const read = step(record, "config");
  if (!record.machine && failed(read)) return advance(STOPPED, read.why);
  if (!record.machine && !read) return act("read what the machine already says", { type: "read-config" });
  const plugin = pluginInHand(record);
  const install = step<void>(record, `install:${plugin}`);
  if (failed(install)) return advance(STOPPED, install.why);
  if (!install) return act(`install ${plugin}`, { type: "install", spec: plugin });
  const setup = step<readonly CheckFinding[]>(record, `setup:${plugin}`);
  if (failed(setup)) return advance(STOPPED, setup.why);
  if (!setup) return act(`run ${plugin}'s setup`, { type: "setup", plugin });
  const red = setup.value.find((finding) => !finding.ok);
  if (red) return advance(STOPPED, stoppedBy(plugin, red));
  return advance("PINGED", `${plugin} is installed and its setup ran`);
}

/**
 * PINGED waits on the doctor: for a harness, the ping of the models its
 * ladder names. A plugin that is not a harness has no model to ping, and a
 * record scoped to one goes straight on to configuring it — the walk asks
 * no workflow and no channels it was not started for.
 */
function planPinged(record: SetupRecord, obs: Observation, _policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const plugin = pluginInHand(record);
  const scoped = given(record).plugin;
  const harness = obs.harnesses.find((one) => one.plugin === plugin);
  if (!harness) {
    if (!scoped) throw new Error(`PINGED holds ${plugin}, which is no harness the catalog offers`);
    return advance("CONFIGURING", `${plugin} is not a harness, so there is no model to ping`);
  }
  const ping = step<readonly CheckFinding[]>(record, "ping");
  if (failed(ping)) return advance(STOPPED, ping.why);
  if (!ping) return act(`ping the models the ${harness.name} ladder names`, { type: "ping", plugin });
  const red = ping.value.find((finding) => !finding.ok);
  if (red) return advance(STOPPED, stoppedBy(plugin, red));
  return advance("WORKFLOW", `the models the ${harness.name} ladder names answered their ping`);
}

/** WORKFLOW asks which workflow the machine should drive, installs the one chosen, and writes it. */
function planWorkflow(record: SetupRecord, obs: Observation, policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const answered = workflowIn(record, obs);
  if (answered) {
    if (answered.answer === "none") return advance("CHANNELS", "no workflow was wanted");
    const { name, plugin } = answered.answer;
    const install = step<void>(record, `install:${plugin}`);
    if (failed(install)) return advance(STOPPED, install.why);
    if (!install) return act(`install the ${name} workflow`, { type: "install", spec: plugin });
    const written = step<void>(record, "workflow");
    if (failed(written)) return advance(STOPPED, written.why);
    if (!written) return act(`write ${name} as the workflow the machine drives`, { type: "write-workflow", name, plugin });
    return advance("CHANNELS", `the ${name} workflow is installed and written`);
  }
  return ask(record, obs, policy, workflowAsk(obs.workflows));
}

/** CHANNELS asks which channels should reach the person — one choices ask, every kind named in its labels. */
function planChannels(record: SetupRecord, obs: Observation, policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  if (channelsIn(record, obs)) return advance("CONFIGURING", "the channels were chosen");
  return ask(record, obs, policy, channelsAsk(obs.channels));
}

/**
 * CONFIGURING takes the chosen plugins one at a time: install, read its
 * configSchema, ask each field as a plain post with the current value as
 * its default, write the slice, and on to the next.
 *
 * A plugin whose schema has a record field is refused here, naming the
 * field, and no config for it is written — the walk continues with the
 * others, because a schema setup cannot ask is a fact about the plugin, not
 * a reason to stop the machine.
 */
function planConfiguring(record: SetupRecord, obs: Observation, policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const cursor = record.configuring;
  const inHand = cursor?.plugins[cursor.at];
  if (!cursor || !inHand) return advance("CHECKED", "nothing was chosen to be configured");

  const install = step<void>(record, `install:${inHand}`);
  if (failed(install)) return advance(STOPPED, install.why);
  if (!install) return act(`install ${inHand}`, { type: "install", spec: inHand });

  const schema = obs.schema;
  if (failed(schema)) return advance(STOPPED, schema.why);
  if (!schema) throw new Error(`CONFIGURING holds ${inHand}, whose install is green and whose schema was not read`);

  const recordField = recordFieldIn(schema.value);
  if (recordField) return refusedPlan(record, cursor, inHand, recordField);

  const answered = collected(cursor, record, obs, schema.value);
  const field = fieldsOf(schema.value).find(({ field }) => !(field in answered));
  if (field) return askedPlan(record, obs, policy, cursor, inHand, field);

  return writtenPlan(record, obs, cursor, inHand, schema.value);
}

/** A plugin whose schema holds a record field: refused naming it, the walk continues with the rest. */
function refusedPlan(_record: SetupRecord, cursor: Configuring, inHand: string, recordField: string): Plan {
  const next = cursor.plugins[cursor.at + 1];
  return next
    ? act(`refuse ${inHand} for its \`${recordField}\` record field, and install ${next}`, { type: "install", spec: next })
    : advance("CHECKED", `${inHand} was refused for its \`${recordField}\` record field`);
}

/** The ask one unanswered field needs: posted, waited on, or stopped on with the flag that answers it. */
function askedPlan(
  record: SetupRecord,
  obs: Observation,
  policy: Policy,
  cursor: Configuring,
  inHand: string,
  field: { field: string; spec: ConfigField },
): Plan {
  const open = record.ask?.form === "post" ? record.ask : undefined;
  const openField = open ? fieldOf(open.id) : undefined;
  const id = open && openField === field.field ? open.id : `${inHand}.${field.field}`;
  if (!obs.asks) {
    return advance(
      STOPPED,
      `no conversation is mounted to answer ${inHand}'s \`${field.field}\`; ${flagFor(id)} would answer it`,
      { type: "pending", ask: { id, flag: flagFor(id) } },
    );
  }
  if (open && openField === field.field) return wait(policy.askBackoffMs, `waiting for ${inHand}'s \`${field.field}\``);
  return wait(policy.askBackoffMs, `asking ${inHand}'s \`${field.field}\``, {
    type: "ask-setting",
    plugin: inHand,
    field: field.field,
    text: settingsPost(inHand, field.field, field.spec, currentOf(record, inHand, field.field)),
  });
}

/** The settings once every field is answered: written, and on to the next plugin. */
function writtenPlan(record: SetupRecord, obs: Observation, cursor: Configuring, inHand: string, schema: ConfigSchema): Plan {
  const written = step<void>(record, `settings:${inHand}`);
  if (failed(written)) return advance(STOPPED, written.why);
  if (!written) {
    return act(`write ${inHand}'s settings`, {
      type: "write-settings",
      plugin: inHand,
      values: { ...collected(cursor, record, obs, schema) },
    });
  }
  const following = cursor.plugins[cursor.at + 1];
  return following
    ? act(`${inHand} is configured; installing ${following}`, { type: "install", spec: following })
    : advance("CHECKED", "every chosen plugin is configured");
}

/**
 * CHECKED runs the doctor of everything the walk configured — the settings
 * were just written, so this is where a bad token or a wrong target says
 * so. The harness was already pinged; a refused plugin has nothing written
 * to check.
 */
function planChecked(record: SetupRecord, _obs: Observation, _policy: Policy): Plan {
  if (record.stoppedReason) return advance(STOPPED, record.stoppedReason);
  const cursor = record.configuring;
  const refused = new Set((cursor?.refused ?? []).map((entry) => entry.plugin));
  for (const plugin of cursor?.plugins.slice(0, cursor.at) ?? []) {
    if (refused.has(plugin)) continue;
    const check = step<readonly CheckFinding[]>(record, `check:${plugin}`);
    if (failed(check)) return advance(STOPPED, check.why);
    if (!check) return act(`run ${plugin}'s checks`, { type: "check", plugin });
    const red = check.value.find((finding) => !finding.ok);
    if (red) return advance(STOPPED, stoppedBy(plugin, red));
  }
  return advance("DONE", "everything the person chose is installed, configured and checked");
}

/**
 * Posts the ask and waits for it — or stops when no conversation can carry
 * it, recording the ask and the flag that would answer it so the host can
 * print what would get the walk moving again.
 */
function ask(record: SetupRecord, obs: Observation, policy: Policy, toPost: Ask): Plan {
  const id = record.ask?.id ?? toPost.id;
  if (!obs.asks) {
    return advance(STOPPED, `no conversation is mounted to answer the ${id} ask; ${flagFor(id)} would answer it`, {
      type: "pending",
      ask: { id, flag: flagFor(id) },
    });
  }
  if (record.ask) return wait(policy.askBackoffMs, `waiting for the ${id} answer`);
  return wait(policy.askBackoffMs, `asking ${id}`, { type: "post", ask: toPost });
}

/** One step's result off the record; the cast is the caller's, who knows the step's shape. */
function step<T>(record: SetupRecord, key: string): Result<T> | undefined {
  return record.steps?.[key] as Result<T> | undefined;
}

/** The steps key for one person-facing ask: the ask it was about. */
function askStepOf(effect: Extract<Effect, { type: "post" | "ask-setting" }>): string {
  return effect.type === "post" ? `ask:${effect.ask.id}` : `ask:${effect.plugin}.${effect.field}`;
}

/** The steps key for one effect: what it was about, so the next look judges it. */
export function stepOf(effect: Effect): string {
  return (STEP_KEYS[effect.type] as (one: Effect) => string)(effect);
}

/** One key-minter per effect; a missing one is a type error, not a runtime surprise. */
const STEP_KEYS: { readonly [K in Effect["type"]]: (effect: Extract<Effect, { type: K }>) => string } = {
  "read-config": () => "config",
  "write-setup-profile": () => "profile",
  install: (effect) => `install:${effect.spec}`,
  "write-ladder": () => "ladder",
  setup: (effect) => `setup:${effect.plugin}`,
  ping: () => "ping",
  "write-workflow": () => "workflow",
  "write-settings": (effect) => `settings:${effect.plugin}`,
  check: (effect) => `check:${effect.plugin}`,
  post: askStepOf,
  "ask-setting": askStepOf,
  pending: (effect) => `pending:${effect.ask.id}`,
};

/**
 * Why a plugin's red finding stops the walk, naming what it found.
 *
 * The harness doctor's ping names the model that did not answer; anything
 * else a check found names itself. The walk does not invent either — it
 * carries what the check reported.
 */
export function stoppedBy(plugin: string, finding: CheckFinding): string {
  return finding.name === "ping"
    ? `the model ${finding.said} did not answer its ping`
    : `${plugin}'s ${finding.name} check failed: ${finding.said}`;
}

/**
 * The settings gathered for the plugin in hand: what the fold already
 * collected, plus one answered this very look. Pure, so the decision that
 * plans the next post and the fold that keeps the answer agree on what was
 * answered and when.
 */
function collected(
  cursor: NonNullable<SetupRecord["configuring"]>,
  record: SetupRecord,
  obs: Observation,
  schema: ConfigSchema,
): Readonly<Record<string, SettingValue>> {
  const values: Record<string, SettingValue> = parsedFlags(cursor, record, schema);
  const open = record.ask?.form === "post" ? record.ask : undefined;
  const field = open && obs.answer ? fieldOf(open.id) : undefined;
  const spec: ConfigField | undefined = field ? schema[field] : undefined;
  if (open && field && spec && obs.answer) {
    const plugin = cursor.plugins[cursor.at];
    if (plugin !== undefined) {
      const parsed = parseSetting(spec, obs.answer.text, currentOf(record, plugin, field));
      if (parsed !== undefined) values[field] = parsed;
    }
  }
  return values;
}

/**
 * The flag-given values, parsed to their fields' types against the schema
 * in hand (A13). A flag's value arrives as the line the person spelled it
 * as; a line the field's type does not accept, or one naming a field the
 * schema does not declare, is not an answer — the ask it failed to answer
 * stays open, exactly as a reply that did not parse would.
 */
function parsedFlags(
  cursor: NonNullable<SetupRecord["configuring"]>,
  record: SetupRecord,
  schema: ConfigSchema,
): Record<string, SettingValue> {
  const values: Record<string, SettingValue> = { ...cursor.values };
  const inHand = cursor.plugins[cursor.at];
  if (inHand === undefined) return values;
  for (const [flagField, raw] of Object.entries(values)) {
    if (typeof raw !== "string") continue;
    const spec = schema[flagField];
    const parsed = spec ? parseSetting(spec, raw, currentOf(record, inHand, flagField)) : undefined;
    if (parsed === undefined) delete values[flagField];
    else values[flagField] = parsed;
  }
  return values;
}

/** What the machine already holds for one field, for the ask to offer as its default. */
function currentOf(record: SetupRecord, plugin: string, field: string): unknown {
  return record.machine?.settings[plugin]?.[field];
}

/** The plan helper the decisions use for `act`, narrowed to this workflow's effects. */
function act(why: string, effect: Effect): Plan {
  return { kind: "act", effects: [effect], why };
}
