import type { BaseSource, BaseSourceSnapshot, Comment, Ticket, TrackerReads } from "@amykit/core";
import { Row, placeOf, rowsOf } from "./table.js";

/** The status of a row still in the table. */
export const READY = "ready";
/** The status of a plan that left the table for `docs/design/`. */
export const DELIVERED = "delivered";

export interface NextStepsConfig {
  /** The repository the table lives in, as `owner/name`. */
  repo: string;
  /** The table's path in that repository. */
  table: string;
  /** How many rows from the top are work at once. */
  rows: number;
  /** What a row's branch starts with, before its plan's slug. */
  branchPrefix: string;
}

/**
 * An execution-order table as the tracker: a row is a work item, its plan
 * the body, its place in the table the priority.
 *
 * Everything is read from the base branch, through a snapshot, never from a
 * standing checkout somebody may be editing: the order a person merged is the
 * order, and a half-written row on somebody's disk is not work yet.
 *
 * Reads only. There is no comment thread on a plan and no status to move: a
 * row reaches `delivered` because a person merged the pull request that moved
 * its plan to `docs/design/`, which is the review the order deserves. A
 * workflow mounting this runs with its writes handed to the operator.
 */
export class NextStepsTracker implements TrackerReads {
  constructor(
    private readonly source: BaseSource,
    private readonly config: NextStepsConfig,
  ) {}

  async inProgress(): Promise<Ticket[]> {
    const { rows, snapshots } = await this.read();
    const tickets: Ticket[] = [];
    for (const [index, row] of rows.slice(0, this.config.rows).entries()) {
      tickets.push(await this.ticketOf(row, await snapshots(row.repo), READY, index + 1));
    }
    return tickets;
  }

  async get(ticketId: string): Promise<Ticket | null> {
    const { rows, snapshots } = await this.read();
    const index = rows.findIndex((row) => row.id === ticketId);
    const row = rows[index];
    if (row) return this.ticketOf(row, await snapshots(row.repo), READY, index + 1);

    // Gone from the table: delivered where its design note is, and gone
    // where there is none. The id names the repository, so the answer does
    // not depend on the table still linking it, nor on anything remembered.
    const { repo, slug } = placeOf(ticketId, this.config.repo);
    const snapshot = await snapshots(repo);
    const path = `docs/design/${slug}.md`;
    if ((await snapshot.read(path)) === null) return null;
    return this.ticketOf({ id: ticketId, slug, repo, path, label: slug }, snapshot, DELIVERED);
  }

  /** A plan has no comment thread; the conversation about it is the Conversation port's. */
  async comments(_ticketId: string, _since?: string): Promise<Comment[]> {
    return [];
  }

  async hasReplyAfter(_ticketId: string, _since: string): Promise<boolean> {
    return false;
  }

  /** The table's rows, and one snapshot per repository for the rest of this read. */
  private async read(): Promise<{ rows: Row[]; snapshots: (repo: string) => Promise<BaseSourceSnapshot> }> {
    const taken = new Map<string, Promise<BaseSourceSnapshot>>();
    const snapshots = (repo: string): Promise<BaseSourceSnapshot> => {
      let snapshot = taken.get(repo);
      if (!snapshot) taken.set(repo, (snapshot = this.source.snapshot(repo)));
      return snapshot;
    };
    const table = await (await snapshots(this.config.repo)).read(this.config.table);
    if (table === null) {
      throw new Error(`the next-steps tracker reads ${this.config.table} in ${this.config.repo}, and its base branch has no such file`);
    }
    return { rows: rowsOf(table, { repo: this.config.repo, path: this.config.table }), snapshots };
  }

  private async ticketOf(row: Row, snapshot: BaseSourceSnapshot, status: string, priority?: number): Promise<Ticket> {
    const body = await snapshot.read(row.path);
    if (body === null) {
      throw new Error(`the next-steps table links ${row.path} in ${row.repo} for ${row.id}, and its base branch has no such file`);
    }
    return {
      id: row.id,
      title: titleOf(body) ?? row.label,
      url: `https://github.com/${row.repo}/blob/${snapshot.revision}/${row.path}`,
      branchName: `${this.config.branchPrefix}${row.slug}`,
      status,
      body,
      labels: [],
      repo: row.repo,
      ...(priority === undefined ? {} : { priority }),
    };
  }
}

/** The plan's first `# ` heading, after its declaration. */
function titleOf(body: string): string | undefined {
  const heading = /^# (.+)$/m.exec(withoutDeclaration(body));
  return heading?.[1]?.trim();
}

function withoutDeclaration(body: string): string {
  if (!/^---\r?\n/.test(body)) return body;
  const end = body.indexOf("\n---", 3);
  return end < 0 ? body : body.slice(end + 4);
}
