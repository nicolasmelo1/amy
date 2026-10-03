import { CommandResult, CommandRunner } from "./CommandRunner.js";
import { RepoLayout, baseBranchFor, checkoutFor } from "../git.js";

export interface SearchMatch {
  /** A repository path that `read` accepts. */
  path: string;
  line: number;
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  /** True when `limit` cut the list. A cut list must not read as "nothing else". */
  truncated: boolean;
}

export interface HistoryEntry {
  commit: string;
  at: string;
  subject: string;
  /** Whether the commit raised or lowered the number of occurrences. */
  change: "added" | "removed";
}

export interface HistoryResult {
  /** Newest first. */
  entries: HistoryEntry[];
  /**
   * True when `limit` cut the list. Without it, the oldest entry of a cut
   * list would read as the commit that introduced the text, which is the one
   * claim `history` exists to make.
   */
  truncated: boolean;
}

export interface SearchOptions {
  paths?: string[];
  regex?: boolean;
  limit?: number;
}

export interface HistoryOptions {
  paths?: string[];
  limit?: number;
}

/**
 * A read-only view of one repository at one commit of its base branch.
 *
 * Every method answers at `revision`, so two answers from one snapshot never
 * come from two different commits, and a claim made from it can name the
 * commit it was read at.
 */
export interface BaseSourceSnapshot {
  readonly repo: string;
  readonly baseBranch: string;
  /** The full commit id every method below reads at. */
  readonly revision: string;
  /** When that commit was made, as ISO 8601. */
  readonly committedAt: string;
  /** Reads a tracked file as it exists at `revision`. */
  read(path: string): Promise<string | null>;
  /** Where a text appears at `revision`. Literal by default. */
  search(text: string, options?: SearchOptions): Promise<SearchResult>;
  /** Commits up to `revision` that added or removed occurrences of a text. */
  history(text: string, options?: HistoryOptions): Promise<HistoryResult>;
}

/**
 * The narrow source capability grooming receives.
 *
 * It intentionally exposes neither a checkout path nor Git/worktree operations:
 * a groomer can inspect source at the configured base and cannot repoint the
 * standing checkout, create a branch, commit, or acquire a worktree.
 */
export interface BaseSource {
  snapshot(repo: string): Promise<BaseSourceSnapshot>;
}

const DEFAULT_SEARCH_LIMIT = 200;
const DEFAULT_HISTORY_LIMIT = 50;

/**
 * Fetches `origin/<base>`, pins the commit it resolves to, and reads Git
 * objects at that commit. No checkout command is issued, so a standing branch
 * remains exactly where its owner left it.
 */
export class GitBaseSource implements BaseSource {
  constructor(
    private readonly runner: CommandRunner,
    private readonly layout: RepoLayout,
  ) {}

  async snapshot(repo: string): Promise<BaseSourceSnapshot> {
    const cwd = checkoutFor(this.layout, repo);
    const baseBranch = baseBranchFor(this.layout, repo);
    const git = (args: string[]): Promise<CommandResult> => this.runner.run("git", args, { cwd });
    const why = (result: CommandResult): string => result.stderr || result.stdout;

    // The destination is named because a narrowed `remote.origin.fetch` would
    // otherwise fetch the branch and leave origin/<base> where it was.
    const remoteRef = `refs/remotes/origin/${baseBranch}`;
    const fetched = await git(["fetch", "--no-tags", "origin", `+refs/heads/${baseBranch}:${remoteRef}`]);
    if (!fetched.ok) throw new Error(`the grooming source could not fetch ${baseBranch} for ${repo}: ${why(fetched)}`);

    const resolved = await git(["log", "-1", "--no-color", "--format=%H%x00%cI", remoteRef]);
    const [revision, committedAt] = resolved.stdout.split("\0");
    if (!resolved.ok || !revision || !committedAt) throw new Error(`the grooming source cannot read ${repo} at origin/${baseBranch}: ${why(resolved)}`);

    // How many times `text` appears at `commit`, over the same paths `history` was asked about.
    const occurrences = async (commit: string, text: string, paths: string[]): Promise<number> => {
      const result = await git(["grep", "--no-color", "-o", "-h", "-I", "-F", "-e", text, commit, "--", ...paths]);
      if (result.ok) return result.stdout.split("\n").length;
      if (result.exitCode === 1 && !result.stderr) return 0;
      throw new Error(`the grooming source could not count ${JSON.stringify(text)} in ${repo} at ${commit}: ${why(result)}`);
    };

    return {
      repo,
      baseBranch,
      revision,
      committedAt,
      read: async (file) => {
        const result = await git(["show", `${revision}:${file}`]);
        if (result.ok) return result.stdout;
        // A missing file is an ordinary source fact; another failure is not.
        if (result.stderr.includes("does not exist") || result.stderr.includes("exists on disk")) return null;
        throw new Error(`the grooming source could not read ${file} in ${repo}: ${why(result)}`);
      },
      search: async (text, options = {}) => {
        textOf(text);
        const limit = limitOf(options.limit, DEFAULT_SEARCH_LIMIT);
        // The runner buffers everything git prints, so cap each file at the
        // one extra match `truncated` needs rather than read every match there is.
        const args = ["grep", "--no-color", "--no-column", "-n", "-I", "-z", `--max-count=${limit + 1}`, options.regex ? "-E" : "-F", "-e", text, revision, "--", ...(options.paths ?? [])];
        const result = await git(args);
        if (!result.ok && result.exitCode === 1 && !result.stderr) return { matches: [], truncated: false };
        if (!result.ok) throw new Error(`the grooming source could not search ${repo} for ${JSON.stringify(text)}: ${why(result)}`);
        const matches = parseGrep(result.stdout, `${revision}:`);
        return { matches: matches.slice(0, limit), truncated: matches.length > limit };
      },
      history: async (text, options = {}) => {
        textOf(text);
        const limit = limitOf(options.limit, DEFAULT_HISTORY_LIMIT);
        const paths = options.paths ?? [];
        // One more than asked for: the extra entry is what says the list was cut.
        const result = await git(["log", "--no-color", `-S${text}`, "-n", String(limit + 1), "--format=%H%x00%cI%x00%P%x00%s", revision, "--", ...paths]);
        if (!result.ok) throw new Error(`the grooming source could not read the history of ${JSON.stringify(text)} in ${repo}: ${why(result)}`);
        const rows = result.stdout ? result.stdout.split("\n") : [];
        // One commit at a time: each count is a full-tree grep, and fifty at once is a fork bomb on a large repository.
        const entries: HistoryEntry[] = [];
        for (const row of rows.slice(0, limit)) {
          const [commit = "", at = "", parents = "", ...subject] = row.split("\0");
          const parent = parents.split(" ")[0];
          const after = await occurrences(commit, text, paths);
          const before = parent ? await occurrences(parent, text, paths) : 0;
          // A move between files changes no total; the text still exists after it, so it did not go away.
          entries.push({ commit, at, subject: subject.join("\0"), change: after >= before ? "added" : "removed" });
        }
        return { entries, truncated: rows.length > limit };
      },
    };
  }
}

// An empty text matches every line, and a bare `-S` makes git read the next flag as its argument.
function textOf(text: string): void {
  if (text === "") throw new Error("the grooming source needs a text to look for, and was given an empty one");
}

function limitOf(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error(`the grooming source needs a limit that is a whole number of zero or more, not ${limit}`);
  return limit;
}

/**
 * Reads `git grep -n -z` output, `<prefix><path>\0<line>\0<text>\n` per match.
 * The path is read up to its NUL rather than split on newlines first, because
 * a path may contain a newline and the matched text never does.
 */
function parseGrep(output: string, prefix: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let at = 0;
  while (at < output.length) {
    const pathEnd = output.indexOf("\0", at);
    const lineEnd = pathEnd < 0 ? -1 : output.indexOf("\0", pathEnd + 1);
    if (lineEnd < 0) break;
    const textEnd = output.indexOf("\n", lineEnd + 1);
    const where = output.slice(at, pathEnd);
    matches.push({
      path: where.startsWith(prefix) ? where.slice(prefix.length) : where,
      line: Number(output.slice(pathEnd + 1, lineEnd)),
      text: output.slice(lineEnd + 1, textEnd < 0 ? output.length : textEnd),
    });
    at = textEnd < 0 ? output.length : textEnd + 1;
  }
  return matches;
}
