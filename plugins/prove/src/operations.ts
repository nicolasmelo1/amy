import path from "node:path";
import { OperationScope, defineOperation, fail, scopeOf } from "@amykit/core";
import { z } from "zod";
import { blocking, holds } from "./assertions.js";
import { PROOFS_DIRECTORY, ProofStore } from "./proof.js";

/**
 * Where an operation finds the proofs. An operation is handed its profile's
 * directory, not the project's artifact root; a project's profile lives at
 * `projects/<project>/<profile>` and its artifact root beside it, which is
 * where the proving phase writes. Any other profile keeps them in its own.
 */
export function proofsOfScope(scope: Pick<OperationScope, "state">): ProofStore {
  const project = path.dirname(scope.state);
  const inProject = path.basename(path.dirname(project)) === "projects";
  return new ProofStore(path.join(inProject ? path.join(project, "artifacts") : scope.state, PROOFS_DIRECTORY));
}

const status = z.enum(["passed", "failed", "unsupported"]);

const assertionInput = z.object({
  id: z.string().min(1),
  criterion: z.string().min(1).optional(),
  status,
  why: z.string().optional(),
});

const proofOutput = z.object({
  unit: z.string(),
  scenario: z.string(),
  outcome: z.enum(["proven", "refused"]),
  refused: z.string().optional(),
  ranBy: z.string(),
  manual: z.boolean(),
  against: z.array(z.string()),
  codeDigest: z.string().nullable(),
  briefRevision: z.number(),
  at: z.string(),
  assertions: z.array(assertionInput),
});

/**
 * A run a person did by hand, recorded as the proof. The record makes it a
 * proof, not who ran it: it names the scenario, each assertion's status,
 * who ran it and what it ran against.
 */
const recordProof = defineOperation({
  id: "prove.record",
  domain: "prove",
  summary: "Record a scenario a person ran by hand as the unit's proof",
  description:
    "Writes the proof record the proving phase writes, beside the briefs, with `manual` set and the person who ran it named. " +
    "Each assertion is given as `id=status`; an unsupported one blocks completion like a failed one. Runs nothing itself.",
  input: z.object({
    unit: z.string().min(1).describe("the unit proved: the brief's id"),
    scenario: z.string().min(1).describe("the scenario that was run"),
    by: z.string().min(1).describe("who ran it"),
    assertion: z.array(z.string()).min(1).describe("each assertion's status, as `id=passed`, `id=failed` or `id=unsupported`; `id@criterion=status` names the criterion it answers"),
    against: z.array(z.string()).default([]).describe("what it ran against: an environment, an account, a build"),
    digest: z.string().optional().describe("the digest of the code it proved, when the unit has code"),
    revision: z.number().int().min(0).describe("the brief revision it proved"),
  }),
  output: proofOutput,
  errors: { "prove.assertion": { description: "an assertion is not written as `id=status`" } },
  writes: [],
  http: { method: "post", path: "/prove/proofs", status: 201 },
  cli: { words: ["prove", "record"], positional: ["unit"] },
  examples: [{
    summary: "a person proved the badge by hand",
    input: { unit: "PROJ-12", scenario: "paid-invoice-badge", by: "ada", assertion: ["badge@C1=passed"], revision: 3 },
    output: {
      unit: "PROJ-12", scenario: "paid-invoice-badge", outcome: "proven", ranBy: "ada", manual: true, against: [], codeDigest: null, briefRevision: 3,
      at: "2026-11-08T12:00:00.000Z", assertions: [{ id: "badge", criterion: "C1", status: "passed" }],
    },
  }],
  async handler(input, context) {
    const assertions = [];
    for (const one of input.assertion) {
      const [named = "", said = ""] = one.trim().split("=");
      const [id = "", criterion] = named.split("@");
      const read = status.safeParse(said);
      if (!id || criterion === "" || !read.success || one.split("=").length !== 2) {
        return fail("prove.assertion", `\`${one}\` is not \`id=status\`, status one of passed, failed and unsupported`);
      }
      assertions.push({ id, ...(criterion ? { criterion } : {}), status: read.data });
    }
    const proof = {
      unit: input.unit,
      scenario: input.scenario,
      outcome: holds(assertions) ? "proven" as const : "refused" as const,
      ...(holds(assertions) ? {} : { refused: blocking(assertions).join("; ") }),
      assertions,
      ranBy: input.by,
      manual: true,
      against: input.against,
      codeDigest: input.digest ?? null,
      briefRevision: input.revision,
      at: new Date().toISOString(),
    };
    proofsOfScope(scopeOf(context, "prove.record")).write(proof);
    return proof;
  },
});

/** Where a unit stands: proven for the code and brief it is at, or why not. */
const showStanding = defineOperation({
  id: "prove.show",
  domain: "prove",
  summary: "Say whether a unit is proven for the code and brief it is at now",
  description: "Reads the unit's proof record. A proof of other code or of another brief revision does not count, and the unit is unproven again.",
  input: z.object({
    unit: z.string().min(1).describe("the unit: the brief's id"),
    digest: z.string().optional().describe("the digest of the code as it is now"),
    revision: z.number().int().min(0).describe("the brief revision as it is now"),
  }),
  output: z.object({
    proven: z.boolean().describe("proven"),
    why: z.string().optional().describe("why not"),
    proof: proofOutput.optional(),
  }),
  writes: [],
  http: { method: "get", path: "/prove/proofs/{unit}" },
  cli: { words: ["prove", "show"], positional: ["unit"] },
  examples: [{
    summary: "a unit whose code moved since its proof",
    input: { unit: "PROJ-12", digest: "b2", revision: 3 },
    output: { proven: false, why: "the proof certified code a1, and the code is b2 now" },
  }],
  async handler(input, context) {
    const standing = proofsOfScope(scopeOf(context, "prove.show")).standing(input.unit, { codeDigest: input.digest ?? null, briefRevision: input.revision });
    return standing.proven
      ? { proven: true, proof: { ...standing.proof, assertions: [...standing.proof.assertions], against: [...standing.proof.against] } }
      : { proven: false, why: standing.why, ...(standing.proof ? { proof: { ...standing.proof, assertions: [...standing.proof.assertions], against: [...standing.proof.against] } } : {}) };
  },
});

export const proofOperations = [recordProof, showStanding];
