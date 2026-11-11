import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Conversation, Plugin, ThreadRef, WORKFLOW_RUNTIME, WorkflowRuntime, mount } from "@amykit/core";
import { fakeAgent, fakeGate, fakeHost, fakeTracker, fakeWorkspace, policy, ticket } from "@amykit/test-fixtures";
import { actionsFor } from "../src/actions.js";
import { newRecord, plugin } from "./drawn.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const UNIT = ticket().id;
const CALLED = `${UNIT}/WORK#1`;

/** A conversation that keeps every thread it was asked to open, and what was asked of it. */
function threads(): Conversation & { opened: string[]; asked: string[]; held: Map<string, ThreadRef> } {
  const held = new Map<string, ThreadRef>();
  const opened: string[] = [];
  const asked: string[] = [];
  return {
    held, opened, asked,
    known: async (workId) => {
      asked.push(workId);
      return held.get(workId);
    },
    open: async (workId, title) => {
      opened.push(`${workId}: ${title}`);
      const thread = held.get(workId) ?? { id: `thread-${workId}` };
      held.set(workId, thread);
      return thread;
    },
    post: async () => "message",
    replies: async () => [],
  };
}

async function mounted(conversation: Conversation): Promise<WorkflowRuntime> {
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      registry.port("tracker", fakeTracker({ get: async (id) => (id === UNIT ? ticket() : null) }));
      registry.port("code-host", fakeHost());
      registry.port("agent", fakeAgent());
      registry.port("gate", fakeGate());
      registry.port("notifier", { announce: async () => {} });
      registry.port("conversation", conversation);
    },
  };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "amy-threads-"));
  fs.writeFileSync(path.join(profile, "roster.yaml"), 'confirmedOn: "2026-09-03"\nreviewers:\n  - { tracker: ada@example.test, host: ada, available: true }\nqa: { tracker: grace@example.test, host: grace, available: true }\n');
  const outcome = await mount([fakeWorkspace(), plugin, world], { "@amykit/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA" } }, {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => NOW,
    paths: { state: profile, profile },
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow!;
  return outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;
}

describe("a called ticket's thread", () => {
  it("is read without being opened: a look waiting on an answer asks for the unit's thread and creates none", async () => {
    const conversation = threads();
    const runtime = await mounted(conversation);
    const waiting = {
      ...newRecord(CALLED, NOW),
      state: "CLARIFYING",
      triage: { clear: false, questions: ["Which invoice?"], askedQuestions: ["Which invoice?"], at: NOW.toISOString() },
    };

    const observation = await runtime.observe(waiting) as { ticket: { id: string }; conversation: unknown[] };

    expect(observation.ticket.id).toBe(UNIT);
    expect(observation.conversation).toEqual([]);
    expect(conversation.asked).toEqual([UNIT]);
    expect(conversation.opened).toEqual([]);
  });

  it("is the unit's, titled by the ticket, when the called phase asks its question", async () => {
    const conversation = threads();

    await actionsFor(policy)["ask-question"]!({
      ports: { conversation, tracker: {}, brief: undefined },
      ctx: { now: () => NOW },
      announce: async () => {},
    } as never, {
      record: { id: CALLED },
      observation: { ticket: ticket() },
      outcomes: {},
    } as never, { type: "ask-question", questions: ["Which invoice?"] });

    expect(conversation.opened).toEqual([`${UNIT}: ${ticket().title}`]);
    expect(await conversation.known(UNIT)).toEqual({ id: `thread-${UNIT}` });
  });
});
