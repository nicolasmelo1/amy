import { Empty, Section, Stack, Table, Text, type Node } from "@amykit/ui";
import type { Transition } from "@amykit/core";
import { recordsToShow, standing } from "./status-view.js";

/** One record as `amy status --json` reports it. */
export interface StatusRecord {
  readonly id: string;
  readonly state: string;
  readonly waiting: boolean | null;
  readonly finished: boolean | null;
  readonly repo: string | null;
  readonly pullRequest: number | null;
  readonly updatedAt: string;
  readonly attempts: Readonly<Record<string, number>>;
  readonly history: readonly Transition[];
}

/** The loop that is running, as its own record says. */
interface StatusLoop {
  readonly pid: number;
  readonly startedAt: string;
  readonly workflow: string;
}

/** Everything `amy status` knows, which is exactly what `--json` prints. */
export interface StatusSnapshot {
  readonly at: string;
  readonly home: string;
  readonly profile: string;
  readonly workflow: string;
  readonly mounted: boolean;
  readonly problems: readonly string[];
  readonly states: readonly string[];
  readonly waitingStates: readonly string[];
  readonly terminalStates: readonly string[];
  readonly records: readonly StatusRecord[];
  readonly queue: { readonly due: number; readonly pending: number; readonly running: number; readonly finished: number };
  readonly loop: StatusLoop | null;
  readonly paused: string | null;
  readonly notes: number;
  readonly needsInput: number;
}

/** What the page is asked for beyond the snapshot: finished work too, and where the questions wait. */
export interface StatusOptions {
  readonly all: boolean;
  readonly inbox: string;
}

// Widths a terminal has always lined the listing up on. `optional` is what
// lets a row with no repository and no pull request end after its standing.
const COLUMNS = [{ width: 28 }, { width: 18 }, { width: 8 }, { width: 30, optional: true }, { optional: true }];

function Records(props: { readonly snapshot: StatusSnapshot; readonly all: boolean }): Node {
  const { records, mounted, waitingStates, terminalStates } = props.snapshot;
  // Without a mount there are no states to compare against, and the page
  // says `?` rather than guess; the snapshot carries empty lists then.
  const waiting = mounted ? waitingStates : undefined;
  const terminal = mounted ? terminalStates : undefined;
  const view = recordsToShow(records, terminal, props.all);

  if (records.length === 0) return <Empty>nothing tracked yet</Empty>;
  if (view.shown.length === 0) return <Empty>nothing open</Empty>;

  const rows = view.shown.map((record) => [
    record.id,
    record.state,
    standing(record.state, waiting, terminal),
    record.repo ?? "",
    record.pullRequest ? `#${record.pullRequest}` : "",
  ]);
  return <Table columns={COLUMNS} rows={rows} />;
}

function loopLine(snapshot: StatusSnapshot): string {
  const paused = snapshot.paused ? ` (paused: ${snapshot.paused})` : "";
  const live = snapshot.loop;
  return live
    ? `loop:  running since ${live.startedAt}, driving ${live.workflow}, pid ${live.pid}${paused}`
    : `loop:  not running${paused}`;
}

/**
 * `amy status`, as a view: a pure function from the snapshot `--json` prints
 * to a tree of primitives. The text renderer draws the page a terminal has
 * always printed; a window draws the same tree, so the two cannot disagree.
 */
export function statusView(snapshot: StatusSnapshot, options: StatusOptions): Node {
  const records = recordsToShow(snapshot.records, snapshot.mounted ? snapshot.terminalStates : undefined, options.all);
  const { queue } = snapshot;

  return (
    <Stack gap={1}>
      <Records snapshot={snapshot} all={options.all} />
      {records.finished > 0 && <Text tone="muted">{`${records.finished} finished, not shown. \`amy status --all\` lists them.`}</Text>}
      <Section>
        <Text>{`queue: ${queue.due} due, ${queue.pending} pending, ${queue.running} in flight, ${queue.finished} finished`}</Text>
        <Text>{loopLine(snapshot)}</Text>
        {snapshot.notes > 0 && <Text>{`notes: ${snapshot.notes} written down`}</Text>}
      </Section>
      {snapshot.needsInput > 0 && (
        <Text tone="warning">{`${snapshot.needsInput} question(s) waiting for you in ${options.inbox}`}</Text>
      )}
    </Stack>
  );
}
