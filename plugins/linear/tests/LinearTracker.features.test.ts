import { describe, it, expect } from "vitest";
import { LinearTracker } from "../src/LinearTracker.js";
import { ScriptedGraphQL } from "@amykit/test-fixtures";

// The FeatureTracker half of the adapter. It shipped with nothing calling it
// in this suite, which is what the every-method guardrail beside this file
// exists to catch.

const config = {
  workingStatusName: "In Progress",
  repoByTeam: { PROJ: "Northwind/northwind-backend", WEB: "Northwind/northwind-frontend" },
  defaultRepo: "Northwind/northwind-backend",
};

const feature = {
  id: "uuid-1200",
  identifier: "PROJ-1200",
  title: "Invoices carry their own totals",
  description: "Every invoice shows a total the database computed.",
  url: "https://linear.app/northwind/issue/PROJ-1200/invoices-carry-their-own-totals",
  branchName: "ada/proj-1200-invoices-carry-their-own-totals",
  parent: null,
  labels: { nodes: [{ name: "Feature" }] },
  state: { name: "Todo" },
  team: { id: "team-proj", key: "PROJ", name: "Platform" },
};

const child = (identifier: string, description: string | null) => ({
  ...feature,
  id: `uuid-${identifier}`,
  identifier,
  title: `child ${identifier}`,
  description,
  labels: { nodes: [] },
  parent: { id: feature.id },
});

describe("LinearTracker.features", () => {
  it("asks for the issues labelled Feature and maps each to its repository", async () => {
    const client = new ScriptedGraphQL([
      {
        contains: "query Features",
        data: { issues: { nodes: [feature, { ...feature, identifier: "WEB-7", description: null, team: { id: "t-web", key: "WEB", name: "Web" } }] } },
      },
    ]);

    const features = await new LinearTracker(client, config).features();

    expect(client.calls[0]!.query).toContain(`name: { eq: "Feature" }`);
    expect(features).toEqual([
      { id: "PROJ-1200", title: feature.title, body: feature.description, repos: ["Northwind/northwind-backend"] },
      { id: "WEB-7", title: feature.title, repos: ["Northwind/northwind-frontend"] },
    ]);
  });
});

describe("LinearTracker.getFeature", () => {
  it("returns an issue labelled Feature as a feature", async () => {
    const client = new ScriptedGraphQL([{ contains: "query Feature(", data: { issue: feature } }]);

    expect(await new LinearTracker(client, config).getFeature("PROJ-1200")).toEqual({
      id: "PROJ-1200",
      title: feature.title,
      body: feature.description,
      repos: ["Northwind/northwind-backend"],
    });
    expect(client.variablesFor("query Feature(")).toEqual({ id: "PROJ-1200" });
  });

  it("answers nothing for an issue that is not a feature, rather than pretending it is one", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Feature(", data: { issue: { ...feature, labels: { nodes: [{ name: "Bug" }] } } } },
    ]);

    expect(await new LinearTracker(client, config).getFeature("PROJ-1200")).toBeNull();
  });

  // `issue(id:)` is `Issue!`: a missing one is Linear's not-found error, never null.
  it("answers nothing for an issue that is gone", async () => {
    const client = new ScriptedGraphQL([{ contains: "query Feature(", errors: [{ message: "Entity not found: Issue" }] }]);

    expect(await new LinearTracker(client, config).getFeature("PROJ-1200")).toBeNull();
  });
});

describe("LinearTracker.groomedWork", () => {
  it("keeps only the children this groomer marked as its own", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue(", data: { issue: feature } },
      {
        contains: "query GroomedWork",
        data: {
          issue: {
            children: {
              nodes: [
                child("PROJ-1201", "<!-- amy:groomed-by=feature-grooming -->\nthe aggregate"),
                child("PROJ-1202", "written by a person"),
                child("PROJ-1203", null),
              ],
            },
          },
        },
      },
    ]);

    const work = await new LinearTracker(client, config).groomedWork("PROJ-1200", "feature-grooming");

    // The children are asked for by the feature's uuid, not its identifier.
    expect(client.variablesFor("query GroomedWork")).toEqual({ id: "uuid-1200" });
    expect(work).toEqual([
      {
        id: "PROJ-1201",
        featureId: "PROJ-1200",
        groomedBy: "feature-grooming",
        title: "child PROJ-1201",
        body: "<!-- amy:groomed-by=feature-grooming -->\nthe aggregate",
        retired: false,
      },
    ]);
  });

  it("fails loudly when the feature is not in the tracker", async () => {
    const client = new ScriptedGraphQL([{ contains: "query Issue(", errors: [{ message: "Entity not found: Issue" }] }]);

    await expect(new LinearTracker(client, config).groomedWork("PROJ-9", "feature-grooming")).rejects.toThrow(
      /PROJ-9 is not in Linear/,
    );
  });
});

describe("LinearTracker.createGroomedWork", () => {
  it("files the child under the feature, on the feature's team, marked as groomed", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue(", data: { issue: feature } },
      { contains: "mutation CreateGroomedWork", data: { issueCreate: { success: true, issue: { identifier: "PROJ-1204" } } } },
    ]);

    const created = await new LinearTracker(client, config).createGroomedWork({
      featureId: "PROJ-1200",
      groomedBy: "feature-grooming",
      title: "Compute the total in the database",
      body: "the aggregate",
    });

    expect(client.variablesFor("mutation CreateGroomedWork")).toEqual({
      input: {
        teamId: "team-proj",
        parentId: "uuid-1200",
        title: "Compute the total in the database",
        description: "<!-- amy:groomed-by=feature-grooming -->\nthe aggregate",
      },
    });
    expect(created).toEqual({
      id: "PROJ-1204",
      featureId: "PROJ-1200",
      groomedBy: "feature-grooming",
      title: "Compute the total in the database",
      body: "the aggregate",
      retired: false,
    });
  });

  it("fails loudly when the tracker refuses", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue(", data: { issue: feature } },
      { contains: "mutation CreateGroomedWork", data: { issueCreate: { success: false, issue: null } } },
    ]);

    await expect(
      new LinearTracker(client, config).createGroomedWork({
        featureId: "PROJ-1200",
        groomedBy: "feature-grooming",
        title: "t",
        body: "b",
      }),
    ).rejects.toThrow(/Linear refused groomed work for PROJ-1200/);
  });
});

describe("LinearTracker.updateGroomedWork", () => {
  it("rewrites the title and body of the child it names", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue(", data: { issue: child("PROJ-1201", "old") } },
      { contains: "mutation Update", data: { issueUpdate: { success: true } } },
    ]);

    const updated = await new LinearTracker(client, config).updateGroomedWork("PROJ-1201", {
      title: "new title",
      body: "new body",
    });

    expect(client.variablesFor("mutation Update")).toEqual({
      id: "PROJ-1201",
      input: { title: "new title", description: "new body" },
    });
    expect(updated).toMatchObject({ id: "PROJ-1201", title: "new title", body: "new body", retired: false });
  });

  it("fails loudly when the tracker refuses", async () => {
    const client = new ScriptedGraphQL([
      { contains: "query Issue(", data: { issue: child("PROJ-1201", "old") } },
      { contains: "mutation Update", data: { issueUpdate: { success: false } } },
    ]);

    await expect(
      new LinearTracker(client, config).updateGroomedWork("PROJ-1201", { title: "t", body: "b" }),
    ).rejects.toThrow(/Linear refused an update to PROJ-1201/);
  });
});

describe("LinearTracker.retireGroomedWork", () => {
  it("archives the child rather than deleting it", async () => {
    const client = new ScriptedGraphQL([
      { contains: "mutation RetireGroomedWork", data: { issueArchive: { success: true } } },
    ]);

    await new LinearTracker(client, config).retireGroomedWork("PROJ-1201");

    expect(client.calls[0]!.query).toContain("issueArchive");
    expect(client.variablesFor("mutation RetireGroomedWork")).toEqual({ id: "PROJ-1201" });
  });

  it("fails loudly when the tracker refuses", async () => {
    const client = new ScriptedGraphQL([
      { contains: "mutation RetireGroomedWork", data: { issueArchive: { success: false } } },
    ]);

    await expect(new LinearTracker(client, config).retireGroomedWork("PROJ-1201")).rejects.toThrow(
      /Linear refused retirement of groomed work PROJ-1201/,
    );
  });
});
