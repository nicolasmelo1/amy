import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Baseline, compare, jscpdFindings, knipFindings, passed, render } from "../src/duplication.js";

const root = path.resolve(import.meta.dirname, "../../..");
const bin = (name: string) => path.join(root, "node_modules", ".bin", name);
const BASELINE = path.join(root, "scripts", "duplication-baseline.json");

function write(dir: string, files: Record<string, string>): void {
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    fs.writeFileSync(path.join(dir, relative), text, "utf8");
  }
}

/** A workspace laid out like this repository, checked with this repository's knip.json. */
function knipOn(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amy-knip-"));
  write(dir, {
    "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", workspaces: ["plugins/*"] }),
    "knip.json": fs.readFileSync(path.join(root, "knip.json"), "utf8"),
    "plugins/p/package.json": JSON.stringify({
      name: "p",
      type: "module",
      exports: { ".": "./dist/index.js" },
    }),
    "plugins/p/src/index.ts": 'export { used } from "./reached.js";\n',
    "plugins/p/src/reached.ts": "export const used = 1;\n",
    ...files,
  });
  const result = spawnSync(bin("knip"), ["--production", "--reporter", "json", "--no-exit-code"], {
    cwd: dir,
    encoding: "utf8",
  });
  return knipFindings(JSON.parse(result.stdout)).map((finding) => finding.key);
}

function frozen(...keys: string[]): Baseline {
  return {
    version: 1,
    frozen: Object.fromEntries(keys.map((key) => [key, { review_by: "2030-01-01", note: "debt" }])),
  };
}

describe("code only a test reaches", () => {
  it("is reported when the only caller is a helper under tests/", () => {
    const keys = knipOn({
      "plugins/p/src/probe.ts": "export function onlyAHelperCalls(): number {\n  return 1;\n}\n",
      "plugins/p/tests/helper.ts": 'import { onlyAHelperCalls } from "../src/probe.js";\nexport const value = onlyAHelperCalls();\n',
      "plugins/p/tests/probe.test.ts": 'import { value } from "./helper.js";\nvoid value;\n',
    });

    expect(keys.some((key) => key.includes("onlyAHelperCalls") || key.includes("plugins/p/src/probe.ts"))).toBe(true);
  });

  it("is reported when the only caller is a test under scripts/", () => {
    const keys = knipOn({
      "plugins/p/src/probe.ts": "export function onlyAScriptTestCalls(): number {\n  return 1;\n}\n",
      "scripts/tests/probe.test.ts": 'import { onlyAScriptTestCalls } from "../../plugins/p/src/probe.js";\nonlyAScriptTestCalls();\n',
    });

    expect(keys.some((key) => key.includes("onlyAScriptTestCalls") || key.includes("plugins/p/src/probe.ts"))).toBe(true);
  });
});

describe("a copied block, found by the real detector", () => {
  it("fails against an empty baseline and names both files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amy-jscpd-"));
    const block = Array.from(
      { length: 12 },
      (_, index) => `  const value${index} = input.filter((item) => item.kind === "k${index}").map((item) => item.name);`,
    ).join("\n");
    write(dir, {
      ".jscpd.json": fs.readFileSync(path.join(root, ".jscpd.json"), "utf8"),
      "packages/.keep": "",
      "examples/.keep": "",
      "plugins/a/src/one.ts": `export function one(input: { kind: string; name: string }[]) {\n${block}\n}\n`,
      "plugins/b/src/two.ts": `export function two(input: { kind: string; name: string }[]) {\n${block}\n}\n`,
    });
    const out = path.join(dir, "report");
    spawnSync(bin("jscpd"), ["--config", ".jscpd.json", "--output", out], { cwd: dir, encoding: "utf8" });
    const report = JSON.parse(fs.readFileSync(path.join(out, "jscpd-report.json"), "utf8"));

    const verdict = compare(frozen(), jscpdFindings(report, dir), "2026-11-16");

    expect(passed(verdict)).toBe(false);
    expect(render(verdict).join("\n")).toMatch(/plugins\/a\/src\/one\.ts[\s\S]*plugins\/b\/src\/two\.ts/);
  });
});

describe("the baseline only shrinks", () => {
  const finding = knipFindings({ issues: [{ file: "plugins/p/src/new.ts", exports: [{ name: "fresh" }] }] });

  it("fails a key the baseline at the base did not name, even with a review_by", () => {
    const before = frozen();
    const after = frozen(finding[0]!.key);

    const verdict = compare(after, finding, "2026-11-16", before);

    expect(passed(verdict)).toBe(false);
    expect(render(verdict).join("\n")).toContain("fresh");
  });

  it("keeps passing a key the base already froze", () => {
    const before = frozen(finding[0]!.key);

    const verdict = compare(before, finding, "2026-11-16", before);

    expect(passed(verdict)).toBe(true);
  });

  it("never tells the reader to add a new finding to the baseline", () => {
    const verdict = compare(frozen(), finding, "2026-11-16");
    const rule = fs.readFileSync(path.join(root, ".software-factory/rules/duplicated-code-is-detected.yaml"), "utf8");
    const fix = rule.slice(rule.indexOf("fix:"), rule.indexOf("ratchet:"));

    expect(render(verdict).join("\n")).not.toMatch(/freeze it/i);
    expect(fix).not.toMatch(/freeze it/i);
  });

  it("refuses to reseed over a baseline that already exists", () => {
    const kept = fs.readFileSync(BASELINE, "utf8");
    try {
      const result = spawnSync(bin("tsx"), [path.join(root, "scripts", "check-duplication.ts"), "--seed"], {
        cwd: root,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
      expect(fs.readFileSync(BASELINE, "utf8")).toBe(kept);
    } finally {
      fs.writeFileSync(BASELINE, kept, "utf8");
    }
  }, 120_000);
});
