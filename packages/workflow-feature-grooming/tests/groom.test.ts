import { describe, expect, it, vi } from "vitest";
import { GitBaseSource, type BaseSource, type BriefRecord, type BriefStore, type GroomedWork, type GroomingTracker } from "@amykit/core";
import { groomFeature } from "../src/groom.js";

const NOW = new Date("2026-09-17T12:00:00.000Z");

function briefs(): BriefStore & { records: Map<string, BriefRecord> } {
  const records = new Map<string, BriefRecord>();
  return {
    records,
    get: async (id) => records.get(id) ?? null,
    write: async (input) => {
      const previous = records.get(input.id);
      const next: BriefRecord = {
        id: input.id,
        sections: input.sections,
        questions: previous?.questions ?? [],
        explains: input.explains,
        createdAt: previous?.createdAt ?? input.at,
        updatedAt: input.at,
        revision: (previous?.revision ?? 0) + 1,
      };
      records.set(input.id, next);
      return next;
    },
    appendQuestion: async (input) => {
      const brief = records.get(input.id)!;
      const next = { ...brief, questions: [...brief.questions, input.question], revision: brief.revision + 1, updatedAt: input.at };
      records.set(input.id, next);
      return next;
    },
    retired: async () => [],
    remove: async () => {},
  };
}

describe("feature grooming", () => {
  it("reads the configured base branch at one pinned commit without checkout, branch, or worktree", async () => {
    const revision = "a".repeat(40);
    const run = vi.fn(async (_command: string, args: readonly string[]) => ({
      ok: true, exitCode: 0, stderr: "",
      stdout: args[0] === "show" ? "base column" : args[0] === "log" ? `${revision}\u00002026-09-17T11:00:00Z` : "",
    }));
    const source = new GitBaseSource({ run }, { workspaceRoot: "/unused", checkouts: { "acme/widgets": "/repo" }, defaultBranch: "main", baseBranch: { "acme/widgets": "release" } });
    const snapshot = await source.snapshot("acme/widgets");
    expect(await snapshot.read("schema.sql")).toBe("base column");
    expect(run.mock.calls.map((call) => call[1][0])).toEqual(["fetch", "log", "show"]);
    expect(run.mock.calls.at(0)?.[1]).toEqual(["fetch", "--no-tags", "origin", "+refs/heads/release:refs/remotes/origin/release"]);
    expect(run.mock.calls.at(2)?.[1]).toEqual(["show", `${revision}:schema.sql`]);
    // Answers, not capabilities: nothing on the snapshot names a checkout, a branch to work on, or a runner.
    expect(Object.keys(snapshot).sort()).toEqual(["baseBranch", "committedAt", "history", "read", "repo", "revision", "search"]);
    expect(JSON.stringify(snapshot)).not.toContain("/repo");
  });

  it("rewrites the brief, keeps questions, and retires only grooming-provenanced removed work", async () => {
    const source: BaseSource = { snapshot: async (repo) => ({
      repo, baseBranch: "main", revision: "b".repeat(40), committedAt: NOW.toISOString(),
      read: async () => "existing column",
      search: async () => ({ matches: [], truncated: false }),
      history: async () => ({ entries: [], truncated: false }),
    }) };
    const works: GroomedWork[] = [
      { id: "old", featureId: "F-1", groomedBy: "feature-grooming", title: "old", body: "<!-- amy:grooming-key=remove -->\nremove", retired: false },
      { id: "human", featureId: "F-1", groomedBy: "human", title: "keep", body: "keep", retired: false },
    ];
    const tracker: GroomingTracker = {
      features: async () => [], getFeature: async () => null,
      groomedWork: async () => works.filter((work) => work.groomedBy === "feature-grooming"),
      createGroomedWork: async (input) => {
        const created = { id: "new", featureId: input.featureId, groomedBy: input.groomedBy, title: input.title, body: input.body, retired: false };
        works.push(created);
        return created;
      },
      updateGroomedWork: async (id, input) => ({ id, featureId: "F-1", groomedBy: "feature-grooming", title: input.title, body: input.body, retired: false }),
      retireGroomedWork: async (id) => { works.find((work) => work.id === id)!.retired = true; },
    };
    const store = briefs();
    await store.write({ id: "F-1", sections: [{ name: "Feature", body: "first" }], explains: ["old"], at: NOW.toISOString() });
    await store.appendQuestion({ id: "F-1", question: { workId: "old", question: "why?", at: NOW.toISOString() }, at: NOW.toISOString() });
    const result = await groomFeature({ id: "F-1", title: "Feature", repos: ["acme/widgets"] }, {
      source, tracker, briefs: store, now: () => NOW,
      groomer: { propose: async (_feature, snapshots) => {
        expect(await snapshots[0]!.read("schema.sql")).toBe("existing column");
        return [{ key: "add-index", title: "index", body: "add index" }];
      } },
    });
    expect(result).toMatchObject({ created: ["new"], retired: ["old"] });
    expect(works.find((work) => work.id === "human")?.retired).toBe(false);
    expect(store.records.get("F-1")).toMatchObject({ revision: 3, explains: ["new"], questions: [{ question: "why?" }] });
  });
});
