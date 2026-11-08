import fs from "node:fs";
import path from "node:path";
import { AssertionResult, blocking, holds } from "./assertions.js";

/**
 * A proof is a project artifact, not an execution state: one record per unit
 * beside the briefs in the project's artifact root, written by the proving
 * phase and read by the others through this store — never by reading the
 * proving phase's records or queue.
 *
 * The record makes it a proof, not who ran it: a person's manual run is one
 * as much as amy's, saying who ran it and each assertion's status. It names
 * the code digest and the brief revision it proved; when either moves it
 * stops counting.
 */
export interface ProofRecord {
  readonly unit: string;
  readonly scenario: string;
  /** How the run ended: an assertion passing is not a proof when a step of the run failed. */
  readonly outcome: "proven" | "refused";
  /** Why it was refused, when it was. */
  readonly refused?: string;
  readonly assertions: readonly AssertionResult[];
  /** `amy`, or the person who ran it by hand. */
  readonly ranBy: string;
  readonly manual: boolean;
  /** What it ran against: the resources it leased and the plugins whose operations it called. */
  readonly against: readonly string[];
  /** The code it proved, or null where the unit has no code — a published page, a sent message. */
  readonly codeDigest: string | null;
  readonly briefRevision: number;
  readonly at: string;
}

/** What the unit is, as the other phases read it. */
export type Standing =
  | { readonly proven: true; readonly proof: ProofRecord }
  | { readonly proven: false; readonly why: string; readonly proof?: ProofRecord };

/** The directory under the artifact root the proofs are kept in. */
export const PROOFS_DIRECTORY = "proofs";

export class ProofStore {
  constructor(private readonly root: string) {}

  /** The directory proofs live in, for a replay kept beside them. */
  get directory(): string {
    return this.root;
  }

  write(proof: ProofRecord): void {
    fs.mkdirSync(this.root, { recursive: true });
    const file = this.file(proof.unit);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(proof, null, 2)}\n`);
    fs.renameSync(temporary, file);
  }

  get(unit: string): ProofRecord | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(unit), "utf-8")) as ProofRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /**
   * Whether the unit is proven for the code and brief it is at now. A proof
   * of other code, or of another revision of the brief, does not count, and
   * the unit is unproven again — which is not done.
   */
  standing(unit: string, current: { readonly codeDigest: string | null; readonly briefRevision: number }): Standing {
    const proof = this.get(unit);
    if (!proof) return { proven: false, why: `nothing proved \`${unit}\` yet` };
    if (proof.codeDigest !== current.codeDigest) {
      return { proven: false, proof, why: `the proof certified code ${proof.codeDigest ?? "(none)"}, and the code is ${current.codeDigest ?? "(none)"} now` };
    }
    if (proof.briefRevision !== current.briefRevision) {
      return { proven: false, proof, why: `the proof certified revision ${proof.briefRevision} of the brief, and the brief is at ${current.briefRevision} now` };
    }
    if (proof.outcome !== "proven") return { proven: false, proof, why: `the run was refused: ${proof.refused ?? "no reason recorded"}` };
    if (!holds(proof.assertions)) return { proven: false, proof, why: blocking(proof.assertions).join("; ") || "the proof asserts nothing" };
    return { proven: true, proof };
  }

  private file(unit: string): string {
    return path.join(this.root, `${encodeURIComponent(unit)}.json`);
  }
}
