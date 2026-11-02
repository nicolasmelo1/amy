/** One row of an execution-order table: the plan it links, and where that plan lives. */
export interface Row {
  /** The plan's file name without `.md`, which is the work item's id. */
  slug: string;
  /** The repository the plan lives in, as `owner/name`. */
  repo: string;
  /** The plan's path in that repository. */
  path: string;
  /** The link's own text, for when the plan carries no heading. */
  label: string;
}

/** `[text](target.md)`, the first one in a row being the row's plan. */
const LINK = /\[([^\]]+)\]\(([^)\s]+\.md)\)/;
/** `owner/name:path/to/plan.md`, a plan in another repository. */
const ELSEWHERE = /^([\w.-]+\/[\w.-]+):(.+)$/;

/**
 * The rows of a markdown table, in the order the table keeps them.
 *
 * A row is a table line whose first link points at a markdown file. A relative
 * link is a plan beside the table, in the table's repository; an
 * `owner/name:` link is a plan in another one, which is how one table orders
 * the work of several. Lines that are not table rows — the prose around the
 * table, a second table further down — are read the same way, so the table is
 * the first run of table lines that link plans, and everything after it ends.
 */
export function rowsOf(text: string, table: { repo: string; path: string }): Row[] {
  const rows: Row[] = [];
  let started = false;
  for (const line of text.split(/\r?\n/)) {
    const row = line.trimStart().startsWith("|") ? rowOf(line, table) : null;
    if (row) {
      started = true;
      if (!rows.some((seen) => seen.repo === row.repo && seen.slug === row.slug)) rows.push(row);
    } else if (started && !line.trimStart().startsWith("|")) {
      break;
    }
  }
  return rows;
}

function rowOf(line: string, table: { repo: string; path: string }): Row | null {
  const link = LINK.exec(line);
  if (!link) return null;
  const [, label = "", target = ""] = link;
  if (/^[a-z]+:\/\//i.test(target)) return null;
  const elsewhere = ELSEWHERE.exec(target);
  const repo = elsewhere ? elsewhere[1]! : table.repo;
  const path = elsewhere ? clean(elsewhere[2]!) : clean(join(directoryOf(table.path), target));
  const slug = path.slice(path.lastIndexOf("/") + 1, -".md".length);
  return { slug, repo, path, label };
}

function directoryOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

function join(directory: string, target: string): string {
  return directory === "" ? target : `${directory}/${target}`;
}

/** `a/./b/../c.md` as `a/c.md`, the path git reads. */
function clean(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
