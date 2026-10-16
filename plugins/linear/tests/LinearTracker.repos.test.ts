import { describe, it, expect } from "vitest";
import { LinearTracker } from "../src/LinearTracker.js";
import { ScriptedGraphQL } from "@amykit/test-fixtures";

const config = {
  workingStatusName: "In Progress",
  repoByTeam: { PROJ: "Northwind/northwind-backend" },
  defaultRepo: "Northwind/northwind-backend",
  repoByLabel: { backend: "Northwind/northwind-backend", frontend: "Northwind/northwind-frontend" },
};

const issue = (labels: string[], priority = 0) => ({
  id: "uuid-1239",
  identifier: "PROJ-1239",
  title: "The total is wrong on the invoice",
  description: null,
  url: "https://linear.app/northwind/issue/PROJ-1239/total-is-wrong",
  branchName: "ada/proj-1239-total-is-wrong",
  priority,
  parent: null,
  labels: { nodes: labels.map((name) => ({ name })) },
  state: { name: "In Progress" },
  team: { id: "team-proj", key: "PROJ", name: "Platform" },
});

const working = async (node: ReturnType<typeof issue>) =>
  (await new LinearTracker(new ScriptedGraphQL([{ contains: "query Working", data: { issues: { nodes: [node] } } }]), config).inProgress())[0];

describe("LinearTracker, a ticket in more than one repository", () => {
  it("names every repository its labels put it in, in label order", async () => {
    const ticket = await working(issue(["frontend", "Bug", "backend"]));

    expect(ticket?.repos).toEqual(["Northwind/northwind-frontend", "Northwind/northwind-backend"]);
    expect(ticket?.repo).toBe("Northwind/northwind-frontend");
  });

  it("keeps a ticket with no repository label in its team's repository, and says no more", async () => {
    const ticket = await working(issue(["Bug"]));

    expect(ticket?.repo).toBe("Northwind/northwind-backend");
    expect(ticket).not.toHaveProperty("repos");
  });
});

describe("LinearTracker, urgency", () => {
  it("carries the priority somebody set", async () => {
    expect((await working(issue([], 1)))?.priority).toBe(1);
    expect((await working(issue([], 4)))?.priority).toBe(4);
  });

  it("reads Linear's 0 as no priority at all", async () => {
    expect(await working(issue([], 0))).not.toHaveProperty("priority");
  });
});
