import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkoutFor } from "@amykit/core";
import { readWorktreeSlice } from "../src/slices.js";

const FALSIFIER = "the_doctor_reads_its_own_slice";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** `~/checkouts` becomes an absolute path, the way the mount expands it. */
function expand(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

/** The mutation the property must reject: the doctor's own reading of the slice. */
function oldDoctor(slice: { workspaceRoot?: string; checkouts?: Record<string, string> }): { workspaceRoot: string; checkouts: Record<string, string> } {
  return {
    workspaceRoot: typeof slice.workspaceRoot === "string" && slice.workspaceRoot !== "" ? expand(slice.workspaceRoot) : ".",
    checkouts: Object.fromEntries(Object.entries(slice.checkouts ?? {}).map(([repo, one]) => [repo, expand(one)])),
  };
}

const read = planted ? oldDoctor : readWorktreeSlice;

const workspaceRoot = fc
  .tuple(
    fc.constantFrom("", " ", "  ", "\t"),
    fc.constantFrom("", ".", "~/checkouts", "checkouts", "/var/tmp/checkouts"),
    fc.constantFrom("", " ", "  "),
  )
  .map(([before, value, after]) => `${before}${value}${after}`);

const repoName = fc.constantFrom("widgets", "gadgets", "acme/widgets", "acme/gadgets");

describe("the workspace a doctor reads", () => {
  it(FALSIFIER, async () => {
    await fc.assert(
      fc.asyncProperty(workspaceRoot, repoName, fc.boolean(), async (root, repo, named) => {
        const checkouts = named ? { [repo]: "~/standing/acme" } : {};
        const slice = { workspaceRoot: root, checkouts };

        if (root.trim() === "") {
          // The mount has no directory to clone into, so boot refuses rather
          // than one reader choosing "." and the other cloning from a name.
          expect(() => readWorktreeSlice(slice)).toThrow(/workspaceRoot/);
          return;
        }

        const parsed = read(slice);
        expect(parsed.workspaceRoot).toBe(expand(root.trim()));
        const checkout = checkoutFor({ workspaceRoot: parsed.workspaceRoot, checkouts: parsed.checkouts, defaultBranch: "main" }, repo);
        const name = repo.includes("/") ? repo.slice(repo.indexOf("/") + 1) : repo;
        expect(checkout).toBe(parsed.checkouts[repo] ?? path.join(expand(root.trim()), name));
      }),
      { numRuns: 40 },
    );
  }, 60_000);

  it("reads the slice through one parser", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "packages/cli/src/doctor.ts"), "utf-8");
    expect(source).toContain('from "./slices.js"');
    // No member of the slice is read in the doctor: its own answer is the
    // mount's answer, or the two can name different directories.
    expect(source).not.toMatch(/\bslice\.(workspaceRoot|checkouts|repos|root)\b/);
  });
});
