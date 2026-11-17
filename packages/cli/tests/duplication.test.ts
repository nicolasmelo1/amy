import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  type Baseline,
  compare,
  jscpdFindings,
  knipFindings,
  passed,
  render,
  shrunk,
} from "../src/duplication.js";

const root = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

/** A baseline that freezes exactly the keys it is given, all due in the future. */
function frozen(...keys: string[]): Baseline {
  return {
    version: 1,
    frozen: Object.fromEntries(keys.map((key) => [key, { review_by: "2030-01-01", note: "test" }])),
  };
}

describe("knip --production, read as findings", () => {
  it("reports an export nothing outside a test reaches, naming the file and the symbol", () => {
    const findings = knipFindings({
      issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.detector).toBe("knip");
    expect(findings[0]!.detail).toContain("packages/cli/src/budget.ts: budgetLines");
    expect(findings[0]!.detail).toContain("nothing outside a test reaches it");
  });

  it("covers a type, a file and a dependency, not only exports", () => {
    const findings = knipFindings({
      issues: [
        { file: "packages/cli/src/budget.ts", types: [{ name: "Limits" }] },
        { file: "packages/cli/src/orphan.ts", files: [{ name: "packages/cli/src/orphan.ts" }] },
        { file: "packages/cli/package.json", dependencies: [{ name: "@amykit/plugin-file-notes" }] },
      ],
    });

    expect(findings.map((finding) => finding.key)).toEqual([
      "knip:packages/cli/src/budget.ts#type:Limits",
      "knip:packages/cli/src/orphan.ts#file:packages/cli/src/orphan.ts",
      "knip:packages/cli/package.json#dependency:@amykit/plugin-file-notes",
    ]);
  });

  it("fails a gate whose baseline does not name the export", () => {
    const findings = knipFindings({ issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }] });

    const verdict = compare(frozen(), findings, "2026-11-16");

    expect(passed(verdict)).toBe(false);
    expect(verdict.added.map((finding) => finding.key)).toEqual(["knip:packages/cli/src/budget.ts#export:budgetLines"]);
    expect(render(verdict).join("\n")).toContain("not frozen: packages/cli/src/budget.ts: budgetLines");
  });

  it("is green when the same export is frozen", () => {
    const findings = knipFindings({ issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }] });

    expect(passed(compare(frozen(findings[0]!.key), findings, "2026-11-16"))).toBe(true);
  });

  it("runs in production mode with test helpers declared as entries", () => {
    const config = JSON.parse(read("knip.json")) as {
      workspaces: Record<string, { entry?: string[] }>;
    };
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

    expect(scripts.knip).toContain("--production");
    expect(config.workspaces["packages/*"]?.entry).toContain("tests/**/*.ts!");
    expect(config.workspaces["packages/*"]?.entry).toContain("!tests/**/*.test.ts!");
  });
});

describe("jscpd, read as findings", () => {
  const clone = (firstStart: number, tokens = 120) => ({
    tokens,
    fragment: "const said = theSameBlock(a, b);\n".repeat(4),
    firstFile: { name: path.join(root, "plugins/claude/src/usage.ts"), start: firstStart, end: firstStart + 9 },
    secondFile: { name: path.join(root, "plugins/slack/src/usage.ts"), start: 40, end: 49 },
  });

  it("names both places, so a reader can fold one into the other", () => {
    const [finding] = jscpdFindings({ duplicates: [clone(10)] }, root);

    expect(finding!.detail).toContain("plugins/claude/src/usage.ts:10-19");
    expect(finding!.detail).toContain("plugins/slack/src/usage.ts:40-49");
    expect(finding!.detail).toContain("120-token block");
  });

  it("keeps its key when lines above the block move", () => {
    const before = jscpdFindings({ duplicates: [clone(10)] }, root)[0]!;
    const after = jscpdFindings({ duplicates: [clone(410)] }, root)[0]!;

    expect(after.key).toBe(before.key);
  });

  it("gives two copies of the same text between the same pair two keys", () => {
    const findings = jscpdFindings({ duplicates: [clone(10), clone(200)] }, root);

    expect(new Set(findings.map((finding) => finding.key)).size).toBe(2);
  });

  it("fails a gate whose baseline does not name the copy", () => {
    const findings = jscpdFindings({ duplicates: [clone(10)] }, root);
    const verdict = compare(frozen(), findings, "2026-11-16");

    expect(passed(verdict)).toBe(false);
    expect(render(verdict).join("\n")).toContain("write it once");
  });
});

describe("the ratchet", () => {
  it("freezes what the base reported by name, each with the date it comes due", () => {
    const baseline = JSON.parse(read("scripts/duplication-baseline.json")) as Baseline;
    const keys = Object.keys(baseline.frozen);

    expect(baseline.version).toBe(1);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(baseline.frozen[key]!.review_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(baseline.frozen[key]!.note.trim().length).toBeGreaterThan(0);
    }
    expect(keys.some((key) => key.startsWith("knip:"))).toBe(true);
    expect(keys.some((key) => key.startsWith("jscpd:"))).toBe(true);
  });

  it("drops a pair the detectors no longer report", () => {
    const baseline = frozen("knip:a#export:x", "jscpd:a<->b#10:0123");
    const verdict = compare(baseline, [], "2026-11-16");

    expect(verdict.gone).toEqual(["jscpd:a<->b#10:0123", "knip:a#export:x"]);
    expect(shrunk(baseline, verdict).frozen).toEqual({});
  });

  it("refuses a key added by hand without a review_by", () => {
    const findings = knipFindings({ issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }] });
    const baseline: Baseline = { version: 1, frozen: { [findings[0]!.key]: { review_by: "", note: "" } } };

    const verdict = compare(baseline, findings, "2026-11-16");

    expect(passed(verdict)).toBe(false);
    expect(verdict.unreviewed).toEqual([findings[0]!.key]);
    expect(render(verdict).join("\n")).toContain("frozen without a review_by");
  });

  it("fails once a key is past the date somebody chose for it", () => {
    const findings = knipFindings({ issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }] });
    const baseline: Baseline = {
      version: 1,
      frozen: { [findings[0]!.key]: { review_by: "2026-11-15", note: "came due" } },
    };

    const verdict = compare(baseline, findings, "2026-11-16");

    expect(verdict.overdue).toEqual([findings[0]!.key]);
    expect(passed(verdict)).toBe(false);
    expect(render(verdict).join("\n")).toContain("frozen past its review_by");
  });

  it("reports a key that no longer exists and keeps the ones that do", () => {
    const findings = knipFindings({ issues: [{ file: "packages/cli/src/budget.ts", exports: [{ name: "budgetLines" }] }] });
    const baseline = frozen(findings[0]!.key, "knip:gone#export:x");

    const verdict = compare(baseline, findings, "2026-11-16");

    expect(verdict.gone).toEqual(["knip:gone#export:x"]);
    expect(Object.keys(shrunk(baseline, verdict).frozen)).toEqual([findings[0]!.key]);
  });
});

describe("the L6 rule that keeps both detectors wired", () => {
  it("is a toolchain rule naming the copy detector, enabled in policy", () => {
    const rule = read(".software-factory/rules/duplicated-code-is-detected.yaml");

    expect(rule).toContain("id: L6.DUPLICATED_CODE_IS_DETECTED");
    expect(rule).toContain("kind: toolchain");
    expect(rule).toContain("jscpd");
    expect(read(".software-factory/policy.yaml")).toContain("L6.DUPLICATED_CODE_IS_DETECTED:");
  });

  it("has a mutation fixture that drops the detector, so sf verify proves it fires", () => {
    const fixture = ".software-factory/mutations/L6.DUPLICATED_CODE_IS_DETECTED";
    const policy = read(`${fixture}/.software-factory/policy.yaml`);

    expect(policy).toContain("L6.DUPLICATED_CODE_IS_DETECTED:");
    expect(read(`${fixture}/package.json`)).not.toContain("jscpd");
  });

  it("is a step of CI's build job, so CI applies the ratchet the gate applies", () => {
    const workflow = read(".github/workflows/software-factory.yml");

    expect(workflow).toContain("npm run check:duplication");
    expect(workflow).not.toContain("npm run knip");
  });

  it("is a step of the gate, and the step runs knip and jscpd", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    const step = read("scripts/check-duplication.ts");

    expect(scripts.gate).toContain("npm run check:duplication");
    expect(step).toContain('run("knip")');
    expect(step).toContain('run("jscpd", ["--output", output])');
  });
});
