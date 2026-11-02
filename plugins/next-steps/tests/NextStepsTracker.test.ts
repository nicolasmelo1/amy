import { describe, expect, it } from "vitest";
import type { BaseSource, BaseSourceSnapshot } from "@amykit/core";
import { DELIVERED, NextStepsTracker, READY, rowsOf } from "../src/index.js";

/** Repositories as files at one commit each, which is all a snapshot answers. */
function source(repos: Record<string, Record<string, string>>): BaseSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    snapshot: async (repo) => {
      asked.push(repo);
      const files = repos[repo];
      if (!files) throw new Error(`no such repository ${repo}`);
      return {
        repo,
        baseBranch: "main",
        revision: `${repo.replace("/", "-")}-head`,
        committedAt: "2026-11-02T00:00:00.000Z",
        read: async (path) => files[path] ?? null,
        search: async () => ({ matches: [], truncated: false }),
        history: async () => ({ entries: [], truncated: false }),
      } satisfies BaseSourceSnapshot;
    },
  };
}

const plan = (title: string) => `---\nexit: "it is done"\n---\n# ${title}\n\nWhy it matters.\n`;

const TABLE = `# Next steps

Prose that links [the contract](../docs/contract.md) before the table.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [Show the currency](show-the-currency.md) | the total says BRL, see [the brief](../docs/brief.md) |
| 2 | [The refund total](acme/gadgets:plans/the-refund-total.md) | the refund says BRL |
| 3 | [Round nothing](./round-nothing.md) | nothing is rounded |

## Elsewhere

| Work | Where |
| --- | --- |
| [Not ours](not-ours.md) | another table |
`;

const WORLD = {
  "acme/widgets": {
    "plans/next-steps.md": TABLE,
    "plans/show-the-currency.md": plan("Show the currency"),
    "plans/round-nothing.md": "No heading and no declaration.\n",
    "docs/design/an-old-row.md": plan("An old row"),
  },
  "acme/gadgets": {
    "plans/the-refund-total.md": plan("The refund total"),
    "docs/design/a-gadgets-row.md": plan("A gadgets row"),
  },
};

const tracker = (rows = 3, world: Record<string, Record<string, string>> = WORLD) =>
  new NextStepsTracker(source(world), { repo: "acme/widgets", table: "plans/next-steps.md", rows, branchPrefix: "plan/" });

describe("a row of next steps is a ticket", () => {
  it("returns the rows from inProgress() in the table's order, and only the table's", async () => {
    const tickets = await tracker().inProgress();

    expect(tickets.map((ticket) => ticket.id)).toEqual(["show-the-currency", "acme/gadgets:the-refund-total", "round-nothing"]);
    expect(tickets.map((ticket) => ticket.priority)).toEqual([1, 2, 3]);
    expect(tickets.every((ticket) => ticket.status === READY)).toBe(true);
  });

  it("takes only as many rows from the top as it is told are work at once", async () => {
    expect((await tracker(1).inProgress()).map((ticket) => ticket.id)).toEqual(["show-the-currency"]);
  });

  it("gives a row in the table's repository its plan as the body, and the table's repository as repo", async () => {
    const ticket = await tracker().get("show-the-currency");

    expect(ticket).toMatchObject({
      id: "show-the-currency",
      title: "Show the currency",
      repo: "acme/widgets",
      status: READY,
      branchName: "plan/show-the-currency",
      url: "https://github.com/acme/widgets/blob/acme-widgets-head/plans/show-the-currency.md",
      labels: [],
    });
    expect(ticket?.body).toBe(plan("Show the currency"));
  });

  it("gives an owner/name: row the repository its link points into, and an id that names it", async () => {
    const ticket = await tracker().get("acme/gadgets:the-refund-total");

    expect(ticket).toMatchObject({
      id: "acme/gadgets:the-refund-total",
      branchName: "plan/the-refund-total",
      repo: "acme/gadgets",
      title: "The refund total",
      url: "https://github.com/acme/gadgets/blob/acme-gadgets-head/plans/the-refund-total.md",
    });
    expect(ticket?.body).toBe(plan("The refund total"));
  });

  it("titles a plan with no heading by its link's text", async () => {
    expect((await tracker().get("round-nothing"))?.title).toBe("Round nothing");
  });

  it("reads a row that left the table with its design note as delivered", async () => {
    const ticket = await tracker().get("an-old-row");

    expect(ticket).toMatchObject({ id: "an-old-row", status: DELIVERED, repo: "acme/widgets", title: "An old row" });
    expect(ticket?.url).toContain("/docs/design/an-old-row.md");
  });

  it("finds a delivered row of another repository by its id, though the table links that repository no more", async () => {
    const world = { "acme/widgets": { "plans/next-steps.md": "| [Show](show-the-currency.md) |\n", "plans/show-the-currency.md": plan("Show") }, "acme/gadgets": WORLD["acme/gadgets"] };

    expect(await tracker(1, world).get("acme/gadgets:a-gadgets-row")).toMatchObject({ id: "acme/gadgets:a-gadgets-row", status: DELIVERED, repo: "acme/gadgets" });
    expect(await tracker(1, world).get("a-gadgets-row")).toBeNull();
  });

  it("reads a row that left the table with no design note as gone", async () => {
    expect(await tracker().get("never-written")).toBeNull();
  });

  it("has no conversation: a plan has no comment thread", async () => {
    expect(await tracker().comments("show-the-currency")).toEqual([]);
    expect(await tracker().hasReplyAfter("show-the-currency", "2026-01-01T00:00:00.000Z")).toBe(false);
  });

  it("refuses a table its base branch does not have, naming the file and the repository", async () => {
    const empty = { "acme/widgets": {} };

    await expect(tracker(1, empty).inProgress()).rejects.toThrow(/plans\/next-steps\.md in acme\/widgets/);
  });

  it("refuses a row whose plan is not there, naming the row", async () => {
    const broken = { "acme/widgets": { "plans/next-steps.md": "| [Gone](gone.md) |\n" } };

    await expect(tracker(1, broken).inProgress()).rejects.toThrow(/plans\/gone\.md in acme\/widgets for gone/);
  });

  it("carries no write: a workflow handed this tracker has nothing to call", () => {
    const methods = Object.getOwnPropertyNames(NextStepsTracker.prototype).filter((name) => name !== "constructor");

    for (const write of ["comment", "setStatus", "assign", "createFollowUp"]) expect(methods).not.toContain(write);
  });
});

describe("reading a table", () => {
  it("reads relative links against the table's directory, and keeps the first of a repeated row", () => {
    const rows = rowsOf("| [A](a.md) |\n| [Up](../docs/up.md) |\n| [A again](a.md) |\n", { repo: "acme/widgets", path: "plans/next-steps.md" });

    expect(rows).toEqual([
      { id: "a", slug: "a", repo: "acme/widgets", path: "plans/a.md", label: "A" },
      { id: "up", slug: "up", repo: "acme/widgets", path: "docs/up.md", label: "Up" },
    ]);
  });

  it("keeps two repositories' plans of one name apart, each by its own id", () => {
    const rows = rowsOf("| [A](acme/a:plans/setup.md) |\n| [B](acme/b:plans/setup.md) |\n| [Ours](setup.md) |\n", { repo: "acme/widgets", path: "plans/next-steps.md" });

    expect(rows.map((row) => row.id)).toEqual(["acme/a:setup", "acme/b:setup", "setup"]);
  });

  it("refuses two different plans that would be one work item, naming both", () => {
    expect(() => rowsOf("| [A](setup.md) |\n| [B](../docs/setup.md) |\n", { repo: "acme/widgets", path: "plans/next-steps.md" }))
      .toThrow(/plans\/setup\.md and docs\/setup\.md in acme\/widgets.*setup/);
  });

  it("does not read a link to the web as a plan", () => {
    expect(rowsOf("| [PR](https://github.com/acme/widgets/pull/1.md) |\n", { repo: "acme/widgets", path: "next-steps.md" })).toEqual([]);
  });

  it("reads a table written with Windows line endings", () => {
    expect(rowsOf("| [A](a.md) |\r\n| [B](b.md) |\r\n", { repo: "acme/widgets", path: "next-steps.md" }).map((row) => row.slug)).toEqual(["a", "b"]);
  });
});
