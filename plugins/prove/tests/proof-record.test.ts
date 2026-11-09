import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { invoke, defineContract } from "@amykit/core";
import { profilePaths } from "../../../packages/cli/src/paths.js";
import { hostPaths } from "../../../packages/cli/src/slices.js";
import { proofOperations, proofsOfScope } from "../src/operations.js";
import { ProofStore, ProofRecord } from "../src/proof.js";
import { proofsAt } from "../src/plugin.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const SCENARIO = "name: one-call\nsteps:\n  - { id: open, operation: page.open, input: {} }\nassertions:\n  - { id: opened, criterion: C1, step: open, path: status, equals: ok }\n";

function proof(overrides: Partial<ProofRecord> = {}): ProofRecord {
  return {
    unit: "TBO-8", scenario: "one-call", outcome: "proven", assertions: [{ id: "opened", status: "passed" }], ranBy: "amy", manual: false,
    against: [], codeDigest: "a1", briefRevision: 2, at: "2026-11-08T12:00:00.000Z", ...overrides,
  };
}

describe("a proof is a record in the project's artifact root", () => {
  it("is written by the proving phase beside the briefs, and read through the store, not the phase's records or queue", async () => {
    const world = new ProveWorld({ digest: "digest" }, { digest: () => ({ ok: true, output: "a1\n" }) });
    world.brief("TBO-8", SCENARIO, 2);
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({ status: "ok" }) })]);

    await walk(world, mounted, newRun(mounted, "TBO-8/PROVE#1"));

    const written = fs.readdirSync(path.join(world.artifacts, "proofs"));
    expect(written).toContain("TBO-8.json");
    // Another phase reads it with nothing but the artifact root: no records, no queue.
    const standing = new ProofStore(path.join(world.artifacts, "proofs")).standing("TBO-8", { codeDigest: "a1", briefRevision: 2 });
    expect(standing).toMatchObject({ proven: true, proof: { unit: "TBO-8", ranBy: "amy", manual: false, codeDigest: "a1", briefRevision: 2 } });
    expect(fs.existsSync(path.join(world.artifacts, "records"))).toBe(false);
  });

  it("is found by an operation where the proving phase of the same project wrote it", () => {
    const home = "/home/amy";
    const profile = { name: "prove", project: { root: "/work/invoices" } } as Parameters<typeof profilePaths>[1];
    const phase = hostPaths(home, profile as never);
    const operation = proofsOfScope({ state: phase.profile! });

    expect(operation.directory).toBe(proofsAt(phase));
    expect(proofsOfScope({ state: "/home/amy/errand" }).directory).toBe("/home/amy/errand/proofs");
  });
});

describe("a person records a manual run as the proof", () => {
  it("names who ran it and each assertion's status, and blocks completion on an unsupported one", async () => {
    const state = fs.mkdtempSync(path.join(os.tmpdir(), "amy-proof-"));
    const contract = defineContract(proofOperations);
    const context = { port: () => undefined, plugin: { state, home: state, settings: {} } };

    const recorded = await invoke(contract, "prove.record", {
      unit: "TBO-9", scenario: "paid-badge", by: "ada", assertion: ["badge@C1=passed", "pixels=unsupported"], against: ["staging"], revision: 3,
    }, context);
    expect(recorded).toMatchObject({ kind: "output", output: { ranBy: "ada", manual: true, against: ["staging"], assertions: [{ id: "badge", criterion: "C1", status: "passed" }, { id: "pixels", status: "unsupported" }] } });

    const shown = await invoke(contract, "prove.show", { unit: "TBO-9", revision: 3 }, context);
    expect(shown).toMatchObject({ kind: "output", output: { proven: false, why: "the run was refused: `pixels` is unsupported: no reason given" } });

    const refused = await invoke(contract, "prove.record", { unit: "TBO-9", scenario: "s", by: "ada", assertion: ["badge"], revision: 3 }, context);
    expect(refused).toMatchObject({ kind: "error", error: { code: "prove.assertion" } });
  });
});

describe("a proof stops counting when what it certified moved", () => {
  const store = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-proof-"));
    const proofs = new ProofStore(root);
    proofs.write(proof());
    return proofs;
  };

  it("counts for the code digest and brief revision it proved", () => {
    expect(store().standing("TBO-8", { codeDigest: "a1", briefRevision: 2 }).proven).toBe(true);
  });

  it("leaves the unit unproven when the code moved", () => {
    expect(store().standing("TBO-8", { codeDigest: "b2", briefRevision: 2 })).toMatchObject({ proven: false, why: "the proof certified code a1, and the code is b2 now" });
  });

  it("leaves the unit unproven when the brief moved", () => {
    expect(store().standing("TBO-8", { codeDigest: "a1", briefRevision: 3 })).toMatchObject({ proven: false, why: "the proof certified revision 2 of the brief, and the brief is at 3 now" });
  });

  it("says nothing proved a unit with no record", () => {
    expect(store().standing("TBO-0", { codeDigest: null, briefRevision: 1 })).toEqual({ proven: false, why: "nothing proved `TBO-0` yet" });
  });
});
