import { describe, it, expect } from "vitest";
import { LinearTracker } from "../src/LinearTracker.js";
import { ScriptedGraphQL } from "@amykit/test-fixtures";

const config = {
  workingStatusName: "In Progress",
  repoByTeam: { PROJ: "Northwind/northwind-backend", WEB: "Northwind/northwind-frontend" },
  defaultRepo: "Northwind/northwind-backend",
};

const issue = {
  id: "uuid-1239",
  identifier: "PROJ-1239",
  title: "The total is wrong on the invoice",
  url: "https://linear.app/northwind/issue/PROJ-1239/total-is-wrong",
  branchName: "ada/proj-1239-total-is-wrong",
  state: { name: "In Progress" },
  team: { id: "team-proj", key: "PROJ", name: "Platform" },
};

describe("LinearTracker.inProgress", () => {
  it("filters on the status name rather than its category", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Working", data: { issues: { nodes: [issue] } } },
    ]);

    await new LinearTracker(client, config).inProgress();

    const query = client.calls[0]!.query;
    // The category would also match In Review, In QA and Ready To Release.
    expect(query).toContain("state: { name: { eq: $status } }");
    expect(query).not.toContain("type:");
    expect(client.variablesFor("query Working")).toEqual({ status: "In Progress" });
  });

  it("only asks for the operator's own tickets", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Working", data: { issues: { nodes: [] } } },
    ]);

    await new LinearTracker(client, config).inProgress();

    expect(client.calls[0]!.query).toContain("assignee: { isMe: { eq: true } }");
  });

  it("uses the branch name the tracker derived", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Working", data: { issues: { nodes: [issue] } } },
    ]);

    const [ticket] = await new LinearTracker(client, config).inProgress();

    expect(ticket?.branchName).toBe("ada/proj-1239-total-is-wrong");
    expect(ticket?.id).toBe("PROJ-1239");
    expect(ticket?.status).toBe("In Progress");
  });

  it("maps the team to its repository", async () => {
    const client = new ScriptedGraphQL([
      {
        contains: "query Working",
        data: {
          issues: {
            nodes: [
              issue,
              { ...issue, identifier: "WEB-7716", team: { id: "t2", key: "WEB", name: "Delivery" } },
            ],
          },
        },
      },
    ]);

    const tickets = await new LinearTracker(client, config).inProgress();

    expect(tickets.map((t) => t.repo)).toEqual([
      "Northwind/northwind-backend",
      "Northwind/northwind-frontend",
    ]);
  });

  it("falls back to the default repository for an unmapped team", async () => {
    const client = new ScriptedGraphQL([
      {
        contains: "query Working",
        data: {
          issues: { nodes: [{ ...issue, team: { id: "t9", key: "NTO", name: "Nitro-Pod" } }] },
        },
      },
    ]);

    const [ticket] = await new LinearTracker(client, config).inProgress();

    expect(ticket?.repo).toBe("Northwind/northwind-backend");
  });
});

describe("LinearTracker.get", () => {
  it("looks a ticket up by its human identifier", async () => {
    const client = new ScriptedGraphQL([{ contains: "query Issue", data: { issue } }]);

    const ticket = await new LinearTracker(client, config).get("PROJ-1239");

    expect(ticket?.id).toBe("PROJ-1239");
    expect(client.variablesFor("query Issue")).toEqual({ id: "PROJ-1239" });
  });

  it("returns nothing for a ticket that is gone", async () => {
    const client = new ScriptedGraphQL([{ contains: "query Issue", data: { issue: null } }]);

    await expect(new LinearTracker(client, config).get("PROJ-9999")).resolves.toBeNull();
  });
});

describe("LinearTracker.comment", () => {
  it("resolves the uuid first, because commentCreate will not take the identifier", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue", data: { issue } },
      { contains: "mutation Comment", data: { commentCreate: { success: true } } },
    ]);

    await new LinearTracker(client, config).comment("PROJ-1239", "a question");

    expect(client.variablesFor("mutation Comment")).toEqual({
      input: { issueId: "uuid-1239", body: "a question" },
    });
  });

  it("fails loudly when the tracker refuses", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue", data: { issue } },
      { contains: "mutation Comment", data: { commentCreate: { success: false } } },
    ]);

    await expect(
      new LinearTracker(client, config).comment("PROJ-1239", "x"),
    ).rejects.toThrow(/refused a comment/);
  });
});

describe("LinearTracker.hasReplyAfter", () => {
  const viewer = { contains: "query Viewer", data: { viewer: { id: "me" } } };

  it("sees a reply from somebody else after the cutoff", async () => {
    const client = new ScriptedGraphQL([
      viewer,
      {
        contains: "query Replies",
        data: {
          issue: {
            comments: {
              nodes: [{ createdAt: "2026-09-03T12:00:00.000Z", user: { id: "them" } }],
            },
          },
        },
      },
    ]);

    await expect(
      new LinearTracker(client, config).hasReplyAfter("PROJ-1239", "2026-09-03T10:00:00.000Z"),
    ).resolves.toBe(true);
  });

  it("ignores the machine's own comment, or asking would answer itself", async () => {
    const client = new ScriptedGraphQL([
      viewer,
      {
        contains: "query Replies",
        data: {
          issue: {
            comments: { nodes: [{ createdAt: "2026-09-03T12:00:00.000Z", user: { id: "me" } }] },
          },
        },
      },
    ]);

    await expect(
      new LinearTracker(client, config).hasReplyAfter("PROJ-1239", "2026-09-03T10:00:00.000Z"),
    ).resolves.toBe(false);
  });

  it("ignores a reply that predates the question", async () => {
    const client = new ScriptedGraphQL([
      viewer,
      {
        contains: "query Replies",
        data: {
          issue: {
            comments: { nodes: [{ createdAt: "2026-09-03T09:00:00.000Z", user: { id: "them" } }] },
          },
        },
      },
    ]);

    await expect(
      new LinearTracker(client, config).hasReplyAfter("PROJ-1239", "2026-09-03T10:00:00.000Z"),
    ).resolves.toBe(false);
  });
});

describe("LinearTracker.setStatus", () => {
  it("resolves the status name to its id on the ticket's own team", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue", data: { issue } },
      {
        contains: "query States",
        data: {
          team: {
            states: {
              nodes: [
                { id: "s-progress", name: "In Progress" },
                { id: "s-qa", name: "In QA" },
              ],
            },
          },
        },
      },
      { contains: "mutation Update", data: { issueUpdate: { success: true } } },
    ]);

    await new LinearTracker(client, config).setStatus("PROJ-1239", "In QA");

    expect(client.variablesFor("query States")).toEqual({ teamId: "team-proj" });
    expect(client.variablesFor("mutation Update")).toEqual({
      id: "PROJ-1239",
      input: { stateId: "s-qa" },
    });
  });

  it("says which team is missing the status", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue", data: { issue } },
      { contains: "query States", data: { team: { states: { nodes: [] } } } },
    ]);

    await expect(
      new LinearTracker(client, config).setStatus("PROJ-1239", "In QA"),
    ).rejects.toThrow(/PROJ has no status called "In QA"/);
  });
});

describe("LinearTracker.assign", () => {
  it("resolves the person by email", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Assignee", data: { users: { nodes: [{ id: "user-grace" }] } } },
      { contains: "mutation Update", data: { issueUpdate: { success: true } } },
    ]);

    await new LinearTracker(client, config).assign("PROJ-1239", "grace@example.test");

    expect(client.variablesFor("mutation Update")).toEqual({
      id: "PROJ-1239",
      input: { assigneeId: "user-grace" },
    });
  });

  it("refuses to guess when the email matches nobody", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Assignee", data: { users: { nodes: [] } } },
    ]);

    await expect(
      new LinearTracker(client, config).assign("PROJ-1239", "ghost@example.test"),
    ).rejects.toThrow(/no Linear user with the email/);
  });
});

describe("LinearTracker.createFollowUp", () => {
  it("hangs the follow-up off the parent, on the parent's team", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue", data: { issue } },
      {
        contains: "mutation FollowUp",
        data: { issueCreate: { success: true, issue: { identifier: "PROJ-1300" } } },
      },
    ]);

    const created = await new LinearTracker(client, config).createFollowUp({
      parentTicketId: "PROJ-1239",
      title: "FUP PROJ-1239: review comments need a decision",
      body: "T1: the types already prove this",
    });

    expect(created).toBe("PROJ-1300");
    expect(client.variablesFor("mutation FollowUp")).toEqual({
      input: {
        teamId: "team-proj",
        parentId: "uuid-1239",
        title: "FUP PROJ-1239: review comments need a decision",
        description: "T1: the types already prove this",
      },
    });
  });
});
