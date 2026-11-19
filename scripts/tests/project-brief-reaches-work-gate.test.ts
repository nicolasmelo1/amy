import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The claim names the product: a project's work phase reads the brief its
 * GROOMED gate judged. A stand-in work phase that resolves the brief itself
 * proves the stand-in, and stays green whatever the shipped workflow reads.
 */
const evidence = path.join(process.cwd(), ".software-factory/evidence/project-phases");
const probe = fs.readFileSync(path.join(evidence, "probe.ts"), "utf-8");
const claim = probe.slice(
  probe.indexOf('"project.the_brief_the_gate_judged_reaches_the_work_triage"'),
  probe.indexOf("// 1b."),
);
const workPhase = fs.readFileSync(path.join(evidence, "phase-triage/index.ts"), "utf-8");

describe("the gate that a project's brief reaches its work", () => {
  it("walks the shipped ticket-to-qa as the work phase", () => {
    expect(workPhase + claim).toMatch(/workflow-ticket-to-qa/);
  });

  it("leaves resolving the brief to the workflow under proof", () => {
    expect(workPhase).not.toMatch(/\bbriefOf\b|\.brief\.get\(|brief\?\.get\(/);
  });

  it("holds a parent brief as well, so the unit's own is read ahead of it", () => {
    expect(claim).toMatch(/briefId/);
    expect(claim.match(/\.write\(\{/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
