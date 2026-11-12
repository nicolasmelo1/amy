import {
  ActionContext,
  Moved,
  Plan,
  WorkflowActionScope,
  actionsOf,
  unitOf,
} from "@amykit/core";
import { fieldOf, parseSetting, recordFieldIn, spelledFlag } from "./asks.js";
import { channelsIn, given, harnessIn, queueOf, workflowIn } from "./answers.js";
import { Effect, stepOf } from "./machine.js";
import { Observation, Policy, Scope } from "./observation.js";
import { green } from "./ports/result.js";
import type { MachineConfig } from "./ports/ConfigFile.js";
import type { Result } from "./ports/result.js";
import type { Answers, Configuring, OpenAsk, SetupRecord, SettingValue } from "./record.js";
import type { configSchema, needs } from "./plugin.js";

type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;
type Work = ActionContext<SetupRecord, Observation>;

/**
 * The actions: each one port call, its result left in the outcomes for the
 * fold to judge. None of them reads a terminal, parses yaml or runs npm —
 * those live behind the ports, so a window conversation can answer this
 * walk unchanged.
 */
export const actions = {
  "read-config": async (scope: ActionScope, work: Work): Promise<void> => {
    work.outcomes["read-config"] = await scope.ports.config.read();
  },

  "write-setup-profile": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "write-setup-profile" }>): Promise<void> => {
    work.outcomes["write-setup-profile"] = await scope.ports.config.writeSetupProfile(effect.workflow);
  },

  install: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "install" }>): Promise<void> => {
    work.outcomes.install = await scope.ports.installer.install(effect.spec);
  },

  "write-ladder": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "write-ladder" }>): Promise<void> => {
    work.outcomes["write-ladder"] = await scope.ports.config.writeLadder(effect.harness);
  },

  setup: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "setup" }>): Promise<void> => {
    work.outcomes.setup = await scope.ports.checks.setup(effect.plugin);
  },

  ping: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "ping" }>): Promise<void> => {
    work.outcomes.ping = await scope.ports.checks.check(effect.plugin);
  },

  "write-workflow": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "write-workflow" }>): Promise<void> => {
    work.outcomes["write-workflow"] = await scope.ports.config.writeWorkflow(effect.name, effect.plugin);
  },

  post: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "post" }>): Promise<void> => {
    const conversation = scope.ports.conversation;
    if (!conversation) throw new Error(`the ${effect.ask.id} ask was posted with no conversation mounted`);
    const thread = await conversation.open(unitOf(work.record), "amy setup");
    const since = scope.ctx.now().toISOString();
    await conversation.post(thread, { text: effect.ask.prompt, ask: effect.ask });
    work.outcomes.post = { thread: thread.id, since };
  },

  "ask-setting": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "ask-setting" }>): Promise<void> => {
    const conversation = scope.ports.conversation;
    if (!conversation) throw new Error(`${effect.plugin}.${effect.field} was asked with no conversation mounted`);
    const thread = await conversation.open(unitOf(work.record), "amy setup");
    const since = scope.ctx.now().toISOString();
    await conversation.post(thread, { text: effect.text });
    work.outcomes["ask-setting"] = { thread: thread.id, since };
  },

  "write-settings": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "write-settings" }>): Promise<void> => {
    work.outcomes["write-settings"] = await scope.ports.config.writeSettings(effect.plugin, effect.values);
  },

  check: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "check" }>): Promise<void> => {
    work.outcomes.check = await scope.ports.checks.check(effect.plugin);
  },

  pending: async (_scope: ActionScope, work: Work, effect: Extract<Effect, { type: "pending" }>): Promise<void> => {
    // Nothing to do — there is no terminal to say it through. The fold
    // keeps the ask and its flag on the record, which is where the host
    // reads them.
    work.outcomes.pending = effect.ask;
  },
};

/**
 * The fold: keeps what each look produced, so the next look judges it.
 *
 * The steps and their results, the answers as they resolve, the ask as it
 * posts and clears, the configuring cursor as it advances — every fold
 * below is idempotent, because a look that is taken again (a wait held, an
 * engine retry) must find the record saying the same thing it said before.
 */
export function remember(
  _scope: Scope,
  current: SetupRecord,
  outcomes: Record<string, unknown>,
  observation: Observation,
  moved: Moved | null,
  decision: Plan,
  _now: Date,
): SetupRecord {
  const plan = decision;
  const effects = actionsOf(plan) as readonly Effect[];
  const next: SetupRecord = { ...current, answers: { ...current.answers } };

  next.steps = foldedSteps(current, effects, outcomes);
  const read = outcomes["read-config"] as Result<MachineConfig> | undefined;
  if (green(read)) next.machine = read.value;

  const answered = foldedAnswers(current, observation);
  if (answered.resolved) next.ask = undefined;
  next.answers = answered.answers;

  const written = foldedWritten(next.answers, effects, outcomes);
  if (written) next.answers = written;

  const setting = answeredSetting(current, observation);
  if (setting.configuring) next.configuring = setting.configuring;
  if (setting.answered) next.ask = undefined;

  const consumedFlags: string[] = [];
  next.configuring = foldCursor(next.configuring ?? current.configuring, next, observation, outcomes, moved, plan, consumedFlags);

  const ask = foldedAsk(effects, outcomes);
  if (ask) next.ask = ask;

  const pending = outcomes.pending as SetupRecord["pending"];
  if (pending) next.pending = pending;

  if (moved?.to === "STOPPED") next.stoppedReason = plan.why;
  next.flags = [...current.flags, ...answered.flags, ...consumedFlags];
  return next;
}

/** The steps this look's port effects produced, keyed by what each was about. */
function foldedSteps(current: SetupRecord, effects: readonly Effect[], outcomes: Record<string, unknown>): Record<string, unknown> {
  const steps: Record<string, unknown> = { ...current.steps };
  for (const effect of effects) {
    const result = outcomes[effect.type];
    if (PORT_STEPS.has(effect.type) && result !== undefined) steps[stepOf(effect)] = result;
  }
  return steps;
}

/**
 * The answers that resolved this look, by a flag before the ask or a reply
 * after it, with the flag spellings the walk consumed. An answer already on
 * the record is not resolved again, so its ask stays cleared and its flag
 * is not consumed twice.
 */
function foldedAnswers(current: SetupRecord, observation: Observation): { answers: Answers; flags: readonly string[]; resolved: boolean } {
  const answers: Answers = { ...current.answers };
  const flags: string[] = [];
  let resolved = false;
  const harness = answers.harness ? undefined : harnessIn(current, observation);
  if (harness) {
    answers.harness = { name: harness.name, plugin: harness.plugin };
    if (harness.via === "flag") flags.push(spelledFlag("harness", harness.name));
    resolved = true;
  }
  const workflow = answers.workflow !== undefined ? undefined : workflowIn(current, observation);
  if (workflow) {
    answers.workflow = workflow.answer;
    if (workflow.via === "flag") flags.push(spelledFlag("workflow", workflow.answer === "none" ? "none" : workflow.answer.name));
    resolved = true;
  }
  const channels = answers.channels ? undefined : channelsIn(current, observation);
  if (channels) {
    answers.channels = channels.choices;
    if (channels.via === "flag" && channels.choices.length > 0) flags.push(spelledFlag("channels", channels.choices.map((choice) => choice.name)));
    resolved = true;
  }
  return { answers, flags, resolved };
}

/** The settings a green write recorded, folded into the answers it wrote for. */
function foldedWritten(answers: Answers, effects: readonly Effect[], outcomes: Record<string, unknown>): Answers | undefined {
  const writeEffect = effects.find((effect): effect is Extract<Effect, { type: "write-settings" }> => effect.type === "write-settings");
  const written = outcomes["write-settings"] as Result<void> | undefined;
  if (green(written) && writeEffect) {
    return { ...answers, settings: { ...answers.settings, [writeEffect.plugin]: writeEffect.values } };
  }
  return undefined;
}

/**
 * The setting answered this very look, folded into the values of the plugin
 * that asked — before the cursor moves, so the answer lands in the plugin
 * whose ask it answered and not in the next one's.
 */
function answeredSetting(current: SetupRecord, observation: Observation): { configuring: Configuring | undefined; answered: boolean } {
  const open = current.ask?.form === "post" ? current.ask : undefined;
  const field = open ? fieldOf(open.id) : undefined;
  if (!open || !field) return { configuring: undefined, answered: false };
  const cursor = current.configuring;
  const plugin = cursor?.plugins[cursor.at];
  const parsed = plugin !== undefined && observation.answer ? replyParsed(current, observation, plugin, field) : undefined;
  if (cursor && parsed !== undefined) {
    return { configuring: { ...cursor, values: { ...cursor.values, [field]: parsed } }, answered: true };
  }
  return { configuring: undefined, answered: false };
}

/** One reply line parsed to its field's type, against what the machine already holds. */
function replyParsed(current: SetupRecord, observation: Observation, plugin: string, field: string): SettingValue | undefined {
  const schema = green(observation.schema) ? observation.schema.value : undefined;
  const spec = schema?.[field];
  if (!spec || !observation.answer) return undefined;
  const held = current.machine?.settings[plugin]?.[field];
  return parseSetting(spec, observation.answer.text, held);
}

/** The ask that posted this look, kept with the marker its replies are read after. */
function foldedAsk(effects: readonly Effect[], outcomes: Record<string, unknown>): OpenAsk | undefined {
  const postEffect = effects.find((effect): effect is Extract<Effect, { type: "post" }> => effect.type === "post");
  if (postEffect && outcomes.post) {
    const posted = outcomes.post as { thread: string; since: string };
    return { id: postEffect.ask.id, form: postEffect.ask.form, thread: posted.thread, since: posted.since };
  }
  const settingEffect = effects.find((effect): effect is Extract<Effect, { type: "ask-setting" }> => effect.type === "ask-setting");
  if (settingEffect && outcomes["ask-setting"]) {
    const asked = outcomes["ask-setting"] as { thread: string; since: string };
    return { id: `${settingEffect.plugin}.${settingEffect.field}`, form: "post", thread: asked.thread, since: asked.since };
  }
  return undefined;
}

/** The effects whose outcome is a step result, judged by the next look. */
const PORT_STEPS = new Set([
  "read-config",
  "write-setup-profile",
  "install",
  "write-ladder",
  "setup",
  "ping",
  "write-workflow",
  "write-settings",
  "check",
]);

/**
 * Where the configuring has got to.
 *
 * The cursor starts the moment the walk enters CONFIGURING with something
 * chosen, and its `at` moves past a plugin when its slice is written green
 * or when its schema refuses it. A flag that answered a setting before its
 * ask was asked is in hand the moment the plugin's turn comes, so the ask
 * is never posted and the flag's spelling is kept.
 *
 * The queue is read from the half-folded record, because the channels
 * answer and the entry into CONFIGURING are folded in the same look — the
 * queue is the answer's.
 */
function foldCursor(
  cursor: Configuring | undefined,
  record: SetupRecord,
  observation: Observation,
  outcomes: Record<string, unknown>,
  moved: Moved | null,
  plan: Plan,
  consumedFlags: string[],
): Configuring | undefined {
  const queue = queueOf(record);
  const seed = (plugin: string | undefined): Readonly<Record<string, SettingValue>> => {
    if (plugin === undefined) return {};
    const values: Record<string, SettingValue> = {};
    for (const [field, value] of Object.entries(given(record).settings[plugin] ?? {})) {
      values[field] = value as SettingValue;
      // The flag answered this field before its ask was asked; its spelling
      // is kept when it is consumed, which is now.
      consumedFlags.push(spelledFlag(`${plugin}.${field}`, value));
    }
    return values;
  };

  if (moved?.to === "CONFIGURING" && queue.length > 0) {
    const plugins = [...queue];
    return { plugins, at: 0, values: seed(plugins[0]), refused: [] };
  }

  if (!cursor) return undefined;
  const inHand = cursor.plugins[cursor.at];
  if (inHand === undefined) return cursor;

  const refusedField = green(observation.schema) ? recordFieldIn(observation.schema.value) : undefined;
  if (refusedField && !refusedAlready(cursor, inHand)) {
    const following = cursor.plugins[cursor.at + 1];
    return {
      ...cursor,
      at: cursor.at + 1,
      values: seed(following),
      refused: [...cursor.refused, { plugin: inHand, field: refusedField }],
    };
  }

  const written = outcomes["write-settings"] as Result<void> | undefined;
  const wrote = (actionsOf(plan) as readonly Effect[]).some((effect) => effect.type === "write-settings");
  if (green(written) && wrote && !refusedAlready(cursor, inHand)) {
    const following = cursor.plugins[cursor.at + 1];
    return { ...cursor, at: cursor.at + 1, values: seed(following) };
  }
  return cursor;
}

/** Whether the cursor already refused this plugin, so a look taken again does not refuse it twice. */
function refusedAlready(cursor: Configuring, plugin: string): boolean {
  return cursor.refused.some((entry) => entry.plugin === plugin);
}
