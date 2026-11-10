import {
  Ask,
  CommandResult,
  ConfigSchema,
  Conversation,
  HostServices,
  Plan,
  Plugin,
  Reply,
  Registry,
  ThreadRef,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  WorkRecord,
  actionsOf,
  applyPlan,
  implementationOf,
  mount,
  movedBy,
  runAction,
} from "@amykit/core";
import { fakeWorkspace } from "@amykit/test-fixtures";
import type { Harness } from "../src/ports/Harnesses.js";
import type { ChannelChoice, WorkflowChoice } from "../src/ports/Catalog.js";
import type { MachineConfig } from "../src/ports/ConfigFile.js";
import type { CheckFinding } from "../src/ports/Checks.js";
import { Result, internal, ok, refused } from "../src/ports/result.js";
import { SetupRecord } from "../src/record.js";
import { plugin as setup } from "./drawn.js";

export const CLAUDE = "@amykit/plugin-claude";
export const CODEX = "@amykit/plugin-codex";
export const HERMES = "@amykit/plugin-hermes-agent";
export const SLACK = "@amykit/plugin-slack";
export const TELEGRAM = "@amykit/plugin-telegram";
export const NOTIFY_HERMES = "@amykit/plugin-notify-hermes";
export const FANCY = "@amykit/plugin-fancy";

/**
 * A conversation that answers what the walk asks, from a script the world
 * holds. This stands in for the terminal conversation — the same port, the
 * same reply shapes Slack and Telegram return — so a walk that completes
 * against it proves the walk needs no terminal of its own.
 */
export class ScriptedConversation implements Conversation {
  readonly asks = true as const;
  /** Every post the walk made, in order, with the ask it carried when it carried one. */
  readonly posted: { text: string; ask?: Ask }[] = [];
  private readonly answers = new Map<string, string[]>();
  private readonly lines: string[] = [];
  private readonly messages: { at: string; text: string; ask?: Ask }[] = [];
  private readonly repliesFor = new Map<string, Reply | undefined>();

  constructor(private readonly at: () => Date) {}

  /** The script: how the person answers one controlled ask. */
  answer(ask: string, chosen: string[]): void {
    this.answers.set(ask, chosen);
  }

  /** The script: what the person types at the next plain post. */
  reply(line: string): void {
    this.lines.push(line);
  }

  async open(workId: string, _title: string): Promise<ThreadRef> {
    return { id: `thread-${workId}` };
  }

  async post(_thread: ThreadRef, message: { text: string; ask?: Ask }): Promise<string> {
    const at = this.at().toISOString();
    this.messages.push({ at, ...message });
    this.posted.push({ text: message.text, ...(message.ask ? { ask: message.ask } : {}) });
    return `message-${this.messages.length}`;
  }

  async replies(_thread: ThreadRef, since: string): Promise<Reply[]> {
    // The reply is assigned to its post once and then stays, so a look
    // taken again at the same ask reads the same answer.
    const replies: Reply[] = [];
    for (const message of this.messages.filter((one) => one.at > since)) {
      let reply = this.repliesFor.get(message.at);
      if (!reply) {
        reply = this.replyTo(message);
        this.repliesFor.set(message.at, reply);
      }
      if (reply) replies.push(reply);
    }
    return replies;
  }

  private replyTo(message: { at: string; text: string; ask?: Ask }): Reply | undefined {
    if (message.ask) {
      const chosen = this.answers.get(message.ask.id);
      if (!chosen) return undefined;
      return {
        at: message.at,
        author: "the person",
        text: message.ask.prompt,
        files: [],
        kind: "decision",
        answer: { ask: message.ask.id, chosen },
      };
    }
    const line = this.lines.shift();
    if (line === undefined) return undefined;
    return { at: message.at, author: "the person", text: line, files: [] };
  }
}

/**
 * The world one setup walk meets, mounted the way the host mounts it: the
 * workflow and a fake for every port, each recording what it was asked to
 * do. The world only moves in response to an ask — nothing passes because
 * an answer was already there before the question was asked.
 */
export class SetupWorld {
  /** What the harness catalog offers, and which are on this machine. */
  harnesses: Harness[] = [
    { name: "claude", plugin: CLAUDE, detected: true },
    { name: "codex", plugin: CODEX, detected: false },
    { name: "hermes", plugin: HERMES, detected: true },
  ];
  /** The workflows the host offers, the current one first. */
  workflows: WorkflowChoice[] = [
    { name: "errand", plugin: "@amykit/workflow-errand", current: true },
    { name: "ticket-to-qa", plugin: "@amykit/workflow-ticket-to-qa", current: false },
  ];
  /** The channels the catalog offers, conversation and notifier. */
  channels: ChannelChoice[] = [
    { name: "slack", plugin: SLACK, kind: "conversation" },
    { name: "telegram", plugin: TELEGRAM, kind: "conversation" },
    { name: "hermes", plugin: NOTIFY_HERMES, kind: "notifier" },
  ];
  /** What the machine's config already says, for the defaults each ask offers. */
  machine: MachineConfig = { ladder: [], workflow: "", settings: {} };
  /** What a config read refuses or fails with, when it does. */
  configFailure: { kind: "refused" | "internal"; why: string } | undefined;
  /** What every config write fails with, when one does. */
  writeFailure: string | undefined;
  /** What a settings write fails with, when only that one does. */
  settingsWriteFailure: string | undefined;
  /** What an install refuses or fails with, when it does. */
  installFailure: { spec?: string; kind: "refused" | "internal"; why: string } | undefined;
  /** One plugin's configSchema, keyed by package. */
  schemas: Record<string, ConfigSchema> = {
    [SLACK]: {
      token: { type: "string", required: true, description: "the token Slack gave this install" },
      members: { type: "string[]", description: "who a notification reaches", default: [] },
    },
    [TELEGRAM]: { chat: { type: "string", required: true, description: "the chat to post into" } },
    [NOTIFY_HERMES]: { target: { type: "string", required: true, description: "where Hermes delivers" } },
    [CODEX]: {},
    [CLAUDE]: {},
    [HERMES]: {},
  };
  /** What a plugin's doctor found, keyed by package; green when absent. */
  findings: Record<string, readonly CheckFinding[]> = {};
  /** What a plugin's setup found, keyed by package; green when absent. */
  setupFindings: Record<string, readonly CheckFinding[]> = {};
  /** The scripted conversation; absent, the machine has no terminal. */
  conversation: ScriptedConversation | undefined;

  // What the fakes were asked to do.
  readonly installed: string[] = [];
  readonly ladders: string[] = [];
  readonly profile: string[] = [];
  readonly workflowWritten: { name: string; plugin: string }[] = [];
  readonly slices: { plugin: string; values: Record<string, unknown> }[] = [];
  readonly setups: string[] = [];
  readonly checkCalls: string[] = [];

  private ticks = 0;
  /** A clock that moves every time it is read, so a post and its `since` are never the same instant. */
  readonly now = (): Date => new Date(Date.UTC(2026, 10, 10, 9, 0, 0) + 1000 * ++this.ticks);

  constructor() {
    this.conversation = new ScriptedConversation(this.now);
  }

  async mounted(): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
    const outcome = await mount([setup, fakeWorkspace(), ...this.providers()], { [setup.name]: {} }, this.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
  }

  private host(): HostServices {
    const runner = { run: async (): Promise<CommandResult> => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) };
    return { runner, now: this.now, paths: { state: "/state" } };
  }

  private providers(): Plugin[] {
    const config = {
      read: async (): Promise<Result<MachineConfig>> => {
        if (this.configFailure) {
          return this.configFailure.kind === "refused" ? refused(this.configFailure.why) : internal(this.configFailure.why);
        }
        return ok({ ladder: [...this.machine.ladder], workflow: this.machine.workflow, settings: structuredClone(this.machine.settings) });
      },
      writeSetupProfile: async (workflow: string): Promise<Result<void>> => {
        this.profile.push(workflow);
        return this.write();
      },
      writeLadder: async (harness: string): Promise<Result<void>> => {
        this.ladders.push(harness);
        return this.write();
      },
      writeWorkflow: async (name: string, plugin: string): Promise<Result<void>> => {
        this.workflowWritten.push({ name, plugin });
        return this.write();
      },
      schemaOf: async (plugin: string): Promise<Result<ConfigSchema>> => {
        const schema = this.schemas[plugin];
        return schema ? ok(schema) : refused(`no schema for ${plugin}`);
      },
      writeSettings: async (plugin: string, values: Record<string, unknown>): Promise<Result<void>> => {
        this.slices.push({ plugin, values: { ...values } });
        return this.settingsWriteFailure ? internal(this.settingsWriteFailure) : this.write();
      },
    };
    const ports: Record<string, object> = {
      harnesses: { all: async () => this.harnesses },
      catalog: { workflows: async () => this.workflows, channels: async () => this.channels },
      installer: {
        install: async (spec: string): Promise<Result<void>> => {
          this.installed.push(spec);
          const failure = this.installFailure;
          if (failure && (!failure.spec || failure.spec === spec)) {
            return failure.kind === "refused" ? refused(failure.why) : internal(failure.why);
          }
          return ok(undefined);
        },
      },
      config,
      checks: {
        setup: async (plugin: string): Promise<Result<readonly CheckFinding[]>> => {
          this.setups.push(plugin);
          return ok(this.setupFindings[plugin] ?? []);
        },
        check: async (plugin: string): Promise<Result<readonly CheckFinding[]>> => {
          this.checkCalls.push(plugin);
          return ok(this.findings[plugin] ?? []);
        },
      },
      ...(this.conversation ? { conversation: this.conversation } : {}),
    };
    return Object.entries(ports).map(([kind, impl]) => ({
      name: `fake-${kind}`,
      register: (registry: Registry) => registry.port(kind, impl),
    }));
  }

  private write(): Result<void> {
    return this.writeFailure ? internal(this.writeFailure) : ok(undefined);
  }
}

/**
 * Scripts a full happy walk: codex by the harness ask, the errand workflow,
 * slack and the hermes notifier as channels, and the settings lines they
 * each ask for.
 */
export function scriptHappy(world: SetupWorld): void {
  const conversation = world.conversation;
  if (!conversation) return;
  conversation.answer("harness", ["codex"]);
  conversation.answer("workflow", ["errand"]);
  conversation.answer("channels", ["slack (conversation)", "hermes (notifier)"]);
  conversation.reply("xoxb-the-token-slack-gave");
  conversation.reply("ada, grace");
  conversation.reply("slack:my-channel");
}

export interface Look {
  readonly from: string;
  readonly to: string;
  readonly plan: Plan;
  readonly actions: string[];
}

/**
 * Looks the way the engine does until the work settles, past every wait:
 * the scripted conversation answers the moment an ask posts, so the walk
 * only ever waits for the look to come round. Throws if it never settles —
 * a walk that cannot get past a wait is a bug to read, not a pass.
 */
export async function walk(
  { workflow, runtime }: { workflow: Workflow; runtime: WorkflowRuntime },
  id: string,
  start?: WorkRecord,
  limit = 160,
): Promise<{ record: SetupRecord; looks: Look[] }> {
  let record: WorkRecord = start ?? runtime.newRecord(id, new Date("2026-11-10T09:00:00.000Z"));
  const looks: Look[] = [];
  for (let step = 0; step < limit; step += 1) {
    const now = new Date(Date.UTC(2026, 10, 10, 9, 1, step));
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    if (plan.kind === "settled") return { record: record as SetupRecord, looks };
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
    }
    const next = runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan));
    looks.push({ from: record.state, to: next.state, plan, actions: actionsOf(plan).map((action) => action.type) });
    record = next;
  }
  throw new Error(`the walk never settled: ${looks.map((look) => `${look.from}>${look.to}`).join(" ")}`);
}
