import { WorkRecord } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { Finding, conformance } from "../src/index.js";
import { advance, runtimeOf, settled, wait, workflowOf } from "./machines.js";

interface Repositories {
  repos: { name: string; approved: boolean }[];
}

/** Merges once every repository is approved — and `guarded` is whether it asks that there be one. */
function merging(guarded: boolean) {
  return workflowOf<Repositories>({
    states: ["reviewing", "merged"],
    terminal: ["merged"],
    waiting: ["reviewing"],
    plan: (record, observation) => {
      if (record.state === "merged") return settled();
      const approved = (guarded ? observation.repos.length > 0 : true) && observation.repos.every((repo) => repo.approved);
      return approved ? advance("merged") : wait();
    },
  });
}

function aReview(repos: Repositories["repos"]) {
  const world = { repos };
  return {
    runtime: () => runtimeOf<WorkRecord, Repositories>("reviewing", { observe: () => ({ repos: world.repos.map((repo) => ({ ...repo })) }) }),
    worlds: [
      {
        name: "two repositories",
        meanwhile: [() => { world.repos = world.repos.map((repo) => ({ ...repo, approved: true })); }],
      },
    ],
  };
}

const foldsOf = (findings: Finding[]) => findings.filter((finding) => finding.property === "folds");

describe("folds", () => {
  it("fails a decision that an empty collection makes by itself, naming the collection", async () => {
    const findings = foldsOf(
      await conformance(merging(false), aReview([{ name: "api", approved: false }, { name: "web", approved: false }])),
    );

    expect(findings).toEqual([
      {
        property: "folds",
        message:
          "two repositories: in `reviewing`, with `observation.repos` empty, the decision to move to `merged` rests on " +
          "`[].every(...)` being true. Had there been anything to check it could have been wait; say what an empty " +
          "collection means instead of letting `every` say it",
      },
    ]);
  });

  it("fails it when the world itself had nothing in the collection", async () => {
    const findings = foldsOf(await conformance(merging(false), aReview([])));

    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining("with the collections as observed, the decision to move to `merged` rests on `[].every(...)`"),
    ]);
  });

  it("passes a fold that says what an empty collection means", async () => {
    expect(
      foldsOf(await conformance(merging(true), aReview([{ name: "api", approved: false }]))),
    ).toEqual([]);
  });

  it("leaves `every` as it found it", async () => {
    const every = Array.prototype.every;
    await conformance(merging(false), aReview([]));

    expect(Array.prototype.every).toBe(every);
    expect([].every(() => false)).toBe(true);
  });

  it("counts a changed payload as a changed decision", async () => {
    // Nothing moves either way; only who is told changes, and telling the
    // backup because "every owner is away" of no owners is the defect.
    const telling = workflowOf<{ owners: { away: boolean }[] }>({
      states: ["telling", "done"],
      terminal: ["done"],
      uses: ["announce"],
      plan: (record, observation) =>
        record.state === "done"
          ? settled()
          : { kind: "advance", to: "done", why: "told", effects: [{ type: "announce", to: observation.owners.every((o) => o.away) ? "backup" : "owner" }] },
    });

    const findings = await conformance(telling, {
      runtime: () => runtimeOf<WorkRecord, { owners: { away: boolean }[] }>("telling", { observe: () => ({ owners: [{ away: false }] }), handlers: { announce: async () => {} } }),
      worlds: [{ name: "an owner at their desk" }],
    });

    expect(foldsOf(findings).map((finding) => finding.message)).toEqual([expect.stringContaining("with `observation.owners` empty")]);
  });

  it("empties a collection however deep it sits", async () => {
    type Deep = { a: { b: { c: { d: { e: { f: { g: { repos: { approved: boolean }[] } } } } } } } };
    const deep = workflowOf<Deep>({
      states: ["reviewing", "merged"],
      terminal: ["merged"],
      waiting: ["reviewing"],
      plan: (record, o) => (record.state === "merged" ? settled() : o.a.b.c.d.e.f.g.repos.every((r) => r.approved) ? advance("merged") : wait()),
    });
    const approved = { value: false };

    const findings = await conformance(deep, {
      runtime: () =>
        runtimeOf<WorkRecord, Deep>("reviewing", {
          observe: () => ({ a: { b: { c: { d: { e: { f: { g: { repos: [{ approved: approved.value }] } } } } } } } }),
        }),
      worlds: [{ name: "deep", meanwhile: [() => { approved.value = true; }] }],
    });

    expect(foldsOf(findings).map((finding) => finding.message)).toEqual([
      expect.stringContaining("with `observation.a.b.c.d.e.f.g.repos` empty"),
    ]);
  });

  it("puts back whatever `every` it found, even somebody else's", async () => {
    const original = Array.prototype.every;
    const theirs = function (this: unknown[], ...args: Parameters<typeof original>) {
      return original.apply(this, args);
    } as typeof original;
    Array.prototype.every = theirs;
    try {
      await conformance(merging(false), aReview([]));
      expect(Array.prototype.every).toBe(theirs);
    } finally {
      Array.prototype.every = original;
    }
  });
});
