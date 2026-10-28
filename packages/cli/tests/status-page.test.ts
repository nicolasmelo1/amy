import { renderText } from "@amykit/ui";
import { describe, expect, it } from "vitest";
import { statusView, type StatusRecord, type StatusSnapshot } from "../src/status-page.js";
import { recordsToShow, standing } from "../src/status-view.js";

const INBOX = "/home/amy/profiles/default/needs-input";

/**
 * What `amy status` printed before it was a view, kept verbatim as the
 * oracle: the body of the old `reportRecords` and the lines after it, with
 * `console.log` collecting into an array instead of writing. Two functions
 * only because the old command was two.
 */
function printedBefore(snapshot: StatusSnapshot, all: boolean): string {
  const out: string[] = [];
  const log = (line = "") => out.push(line);
  const live = snapshot.loop;
  const held = snapshot.paused;
  const notes = snapshot.notes;
  const asked = snapshot.needsInput;

  reportRecordsBefore(snapshot, all, log);

  log(
    `\nqueue: ${snapshot.queue.due} due, ${snapshot.queue.pending} pending, ` +
      `${snapshot.queue.running} in flight, ${snapshot.queue.finished} finished`,
  );

  log(
    live
      ? `loop:  running since ${live.startedAt}, driving ${live.workflow}, pid ${live.pid}` +
          `${held ? ` (paused: ${held})` : ""}`
      : `loop:  not running${held ? ` (paused: ${held})` : ""}`,
  );

  if (notes) log(`notes: ${notes} written down`);
  if (asked) log(`\n${asked} question(s) waiting for you in ${INBOX}`);

  return out.map((line) => `${line}\n`).join("");
}

function reportRecordsBefore(snapshot: StatusSnapshot, all: boolean, log: (line: string) => void): void {
  const records = snapshot.records.map((record) => ({
    ...record,
    repo: record.repo ?? undefined,
    pullRequestNumber: record.pullRequest ?? undefined,
  }));
  const waiting = snapshot.mounted ? snapshot.waitingStates : undefined;
  const terminal = snapshot.mounted ? snapshot.terminalStates : undefined;

  const view = recordsToShow(records, terminal, all);

  if (records.length === 0) log("nothing tracked yet");
  else if (view.shown.length === 0) log("nothing open");

  for (const record of view.shown) {
    const held = standing(record.state, waiting, terminal);
    const pr = record.pullRequestNumber ? `#${record.pullRequestNumber}` : "";
    log(
      `${record.id.padEnd(28)} ${record.state.padEnd(18)} ${held.padEnd(8)} ` +
        `${(record.repo ?? "").padEnd(30)} ${pr}`.trimEnd(),
    );
  }

  if (view.finished) {
    log(`\n${view.finished} finished, not shown. \`amy status --all\` lists them.`);
  }
}

/** What the view prints, through the same `console.log` the command calls. */
function printedNow(snapshot: StatusSnapshot, all: boolean): string {
  return `${renderText(statusView(snapshot, { all, inbox: INBOX }))}\n`;
}

const record = (id: string, state: string, extra: Partial<StatusRecord> = {}): StatusRecord => ({
  id,
  state,
  waiting: null,
  finished: null,
  repo: null,
  pullRequest: null,
  updatedAt: "2026-10-27T10:00:00.000Z",
  attempts: {},
  history: [],
  ...extra,
});

const BASE: StatusSnapshot = {
  at: "2026-10-27T10:00:00.000Z",
  home: "/home/amy",
  profile: "default",
  workflow: "@amykit/workflow-ticket-to-qa",
  mounted: true,
  problems: [],
  states: ["DISCOVERED", "IMPLEMENTING", "ESCALATED", "DONE"],
  waitingStates: ["ESCALATED", "DONE"],
  terminalStates: ["DONE"],
  records: [],
  queue: { due: 0, pending: 0, running: 0, finished: 0 },
  loop: null,
  paused: null,
  notes: 0,
  needsInput: 0,
};

const MIXED = [
  record("TBO-1", "DONE", { repo: "acme/api", pullRequest: 12 }),
  record("TBO-2", "IMPLEMENTING", { repo: "acme/api" }),
  record("TBO-3", "ESCALATED", { pullRequest: 7 }),
  record("TBO-4", "DISCOVERED"),
  record("A-RATHER-LONG-IDENTIFIER-THAT-OVERFLOWS", "A_STATE_NAME_PAST_EIGHTEEN", {
    repo: "an-organisation/a-repository-name-past-thirty",
    pullRequest: 0,
  }),
  record("TBO-6", "DISCOVERED", { repo: "" }),
];

/** Every branch the old printer had, each on its own and in combination. */
const CORPUS: readonly [string, StatusSnapshot][] = [
  ["nothing tracked", BASE],
  ["only finished work", { ...BASE, records: [record("TBO-1", "DONE")] }],
  ["a mix of rows", { ...BASE, records: MIXED }],
  ["a workflow that would not mount", { ...BASE, mounted: false, problems: ["boom"], waitingStates: [], terminalStates: [], records: MIXED }],
  ["a running loop", { ...BASE, records: MIXED, loop: { pid: 4242, startedAt: "2026-10-27T09:00:00.000Z", workflow: "default" } }],
  ["a paused loop", { ...BASE, loop: { pid: 1, startedAt: "2026-10-27T09:00:00.000Z", workflow: "default" }, paused: "deploy freeze" }],
  ["paused and not running", { ...BASE, paused: "operator" }],
  ["an empty pause reason", { ...BASE, paused: "" }],
  ["a busy queue", { ...BASE, queue: { due: 3, pending: 5, running: 1, finished: 40 } }],
  ["notes", { ...BASE, notes: 2 }],
  ["questions", { ...BASE, needsInput: 3 }],
  [
    "everything at once",
    {
      ...BASE,
      records: MIXED,
      queue: { due: 1, pending: 2, running: 1, finished: 9 },
      loop: { pid: 7, startedAt: "2026-10-27T09:00:00.000Z", workflow: "default" },
      paused: "lunch",
      notes: 1,
      needsInput: 1,
    },
  ],
];

describe("amy status, as a view", () => {
  it.each(CORPUS)("prints what it printed before, byte for byte: %s", (_, snapshot) => {
    expect(printedNow(snapshot, false)).toBe(printedBefore(snapshot, false));
  });

  it.each(CORPUS)("prints what it printed before with --all, byte for byte: %s", (_, snapshot) => {
    expect(printedNow(snapshot, true)).toBe(printedBefore(snapshot, true));
  });

  it("keeps the trailing space a row with no repository and no pull request always had", () => {
    const line = printedNow({ ...BASE, records: [record("TBO-4", "DISCOVERED")] }, false).split("\n")[0];

    expect(line).toBe(`${"TBO-4".padEnd(28)} ${"DISCOVERED".padEnd(18)} ${"active".padEnd(8)} `);
  });

  it("is a function of its snapshot alone: the same snapshot is the same page", () => {
    const snapshot = CORPUS[11]?.[1] as StatusSnapshot;

    expect(printedNow(structuredClone(snapshot), false)).toBe(printedNow(snapshot, false));
  });
});
