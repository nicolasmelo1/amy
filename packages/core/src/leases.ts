import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

/**
 * The lane whose action is running, by its record's id. What a lane's `Git`
 * holds every move to — whatever work id the action passes — so a lane moves
 * only its own work, and takes and lets go of branches as itself.
 */
export const runningLane = new AsyncLocalStorage<string>();

/** The lease every lane in a shared checkout takes before it moves anything there. */
export const STANDING_CHECKOUT = "(the standing checkout)";

/**
 * One holder at a time per repository and branch, for the lanes of a fork.
 *
 * Separate worktrees do not stop two lanes writing one branch, and which
 * branch a lane uses is known only once it runs. So a lane takes the branch
 * before it checks it out or moves it, and a second lane asking for it waits
 * until the first one ends. See `docs/design/a-workflow-runs-on-lanes.md`.
 */
export interface BranchLeases {
  /** Takes the branch for `holder`, or says who holds it. Taking one already held by the same holder is a yes. */
  take(repo: string, branch: string, holder: string): { readonly taken: true } | { readonly taken: false; readonly holder: string };
  /** Lets go of every branch `holder` took, and every branch a record under it (`holder/…`) took. */
  release(holder: string): void;
}

/** A lane asked for a branch another lane holds: a wait, never a failure. */
export class LeaseHeld extends Error {
  constructor(
    readonly repo: string,
    readonly branch: string,
    readonly holder: string,
  ) {
    super(`${branch} in ${repo} is held by ${holder} until that lane ends`);
    this.name = "LeaseHeld";
  }
}

/**
 * Leases kept as files, taken the way the file queue takes a claim: an
 * exclusive create, so two processes asking at once cannot both be told yes.
 */
export class FileLeases implements BranchLeases {
  /** The directory, or how to find it once a lease is first asked for. */
  constructor(private readonly where: string | (() => string)) {}

  private get directory(): string {
    return typeof this.where === "function" ? this.where() : this.where;
  }

  take(repo: string, branch: string, holder: string): { readonly taken: true } | { readonly taken: false; readonly holder: string } {
    fs.mkdirSync(this.directory, { recursive: true });
    const file = this.fileFor(repo, branch);
    try {
      fs.writeFileSync(file, `${JSON.stringify({ repo, branch, holder })}\n`, { flag: "wx" });
      return { taken: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const held = this.read(file);
    // A file being written by the process that is taking it reads as nobody
    // yet: asking again is the answer, and the caller does that by waiting.
    if (!held) return { taken: false, holder: "a lane taking it now" };
    // A lane and the calls inside it are one holder: neither waits on the other.
    return related(held.holder, holder) ? { taken: true } : { taken: false, holder: held.holder };
  }

  release(holder: string): void {
    if (!fs.existsSync(this.directory)) return;
    for (const name of fs.readdirSync(this.directory)) {
      const file = path.join(this.directory, name);
      const held = this.read(file)?.holder;
      if (held !== undefined && (held === holder || held.startsWith(`${holder}/`))) fs.rmSync(file, { force: true });
    }
  }

  private fileFor(repo: string, branch: string): string {
    return path.join(this.directory, `${encodeURIComponent(repo)}@${encodeURIComponent(branch)}.lease`);
  }

  private read(file: string): { readonly holder: string } | undefined {
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as { readonly holder: string };
    } catch {
      return undefined;
    }
  }
}

/** One record and another inside it, at any depth, or the same record. */
function related(one: string, other: string): boolean {
  return one === other || other.startsWith(`${one}/`) || one.startsWith(`${other}/`);
}
