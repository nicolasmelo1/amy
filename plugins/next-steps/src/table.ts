/** One row of an execution-order table: the plan it links, and where that plan lives. */
export interface Row {
  /**
   * The work item's id: the plan's slug for a plan in the table's repository,
   * `owner/name:slug` for one in another. Unique across the table, and it
   * names the repository even after the row has left it.
   */
  id: string;
  /** The plan's file name without `.md`. */
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
 *
 * A plan linked twice is one row, the first. Two different plans that would
 * be one work item are refused, naming both: discovery cannot tell them apart.
 */
export function rowsOf(text: string, table: { repo: string; path: string }): Row[] {
  const rows: Row[] = [];
  let started = false;
  for (const line of text.split(/\r?\n/)) {
    const row = line.trimStart().startsWith("|") ? rowOf(line, table) : null;
    if (row) {
      started = true;
      const seen = rows.find((each) => each.id === row.id);
      if (!seen) rows.push(row);
      else if (seen.path !== row.path) {
        throw new Error(`the next-steps table links ${seen.path} and ${row.path} in ${row.repo}, and both would be the work item ${row.id}; rename one`);
      }
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
  return { id: idOf(repo, slug, table.repo), slug, repo, path, label };
}

/** The slug where the plan is the table's own, `owner/name:slug` where it is another repository's. */
export function idOf(repo: string, slug: string, tableRepo: string): string {
  return repo === tableRepo ? slug : `${repo}:${slug}`;
}

/** A work item's repository and slug, read back from its id. */
export function placeOf(id: string, tableRepo: string): { repo: string; slug: string } {
  const elsewhere = ELSEWHERE.exec(id);
  return elsewhere ? { repo: elsewhere[1]!, slug: elsewhere[2]! } : { repo: tableRepo, slug: id };
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
