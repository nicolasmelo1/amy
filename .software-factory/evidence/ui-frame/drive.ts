// Drives the installed conformance harness from another process and writes
// down what each run said.
//
// Usage: tsx drive.ts <install-directory> <report-path>
//
// What is real: the packed and installed @amykit/ui, @amykit/ui-conformance
// and stub renderers, the `amy-ui-conformance` command npm linked for them,
// and the frame and golden that ship inside @amykit/ui. Every assertion is read off the reports the
// command wrote and the exit code it ended with, never off this file's own
// view of the frame.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [install = "", reportPath = ""] = process.argv.slice(2);
if (install === "" || reportPath === "") {
  console.error("usage: drive.ts <install-directory> <report-path>");
  process.exit(2);
}
const bin = path.join(install, "node_modules/.bin/amy-ui-conformance");
const stubs = path.join(install, "node_modules/@amykit/plugin-ui-stub/dist/index.js");

interface Report {
  readonly assertions: readonly { readonly type: string; readonly status: string }[];
  readonly findings: readonly { readonly assertion: string; readonly renderer: string; readonly message: string }[];
  readonly renderers: readonly { readonly name: string }[];
}

interface Run {
  readonly code: number | null;
  readonly report: Report;
  readonly stderr: string;
}

function run(name: string, args: readonly string[]): Run {
  const out = path.join(install, `${name}.json`);
  const done = spawnSync(bin, [...args, "--report", out], { cwd: install, encoding: "utf-8" });
  const report = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf-8")) as Report) : { assertions: [], findings: [], renderers: [] };
  return { code: done.status, report, stderr: done.stderr };
}

const clean = run("clean", ["--renderer", stubs]);
const fixtures = run("fixtures", ["--root", path.join(install, "broken")]);
const broken = run("broken", ["--renderer", path.join(install, "broken.ts")]);
const pair = run("pair", ["--renderer", stubs, "--renderer", path.join(install, "another-header.ts")]);

const passedClean = (type: string): boolean => clean.code === 0 && clean.report.assertions.some((each) => each.type === type && each.status === "passed");
const said = (result: Run, type: string, renderer: string, message: string): boolean =>
  result.code === 1 && result.report.findings.some((each) => each.assertion === type && each.renderer === renderer && each.message.includes(message));

interface Assertion {
  readonly type: string;
  readonly status: "passed" | "failed";
  readonly detail?: { readonly clean: boolean; readonly unseen: readonly string[] };
}

const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail: Assertion["detail"]) => assertions.push({ type, status: ok ? "passed" : "failed", ...(ok ? {} : { detail }) });

const checks: Record<string, readonly (readonly [Run, string, string])[]> = {
  "frame.every_region_sits_where_declared": [
    [fixtures, "nav2-on-the-right", "nav2 is declared left, and is not left of canvas"],
    [fixtures, "never-draws-the-panel", "panel should be drawn now, and is not"],
  ],
  "frame.no_region_is_invented": [[broken, "invents-a-region", "sidebar is drawn, and the frame declares no such region"]],
  "frame.every_key_does_what_it_is_declared_to": [[fixtures, "enter-decides", "<CR> in insert mode did thread.decide; the frame declares thread.post-discussion"]],
  "frame.renderers_agree_on_every_region": [[pair, "stub-desktop", "another-header and stub-desktop differ first at /surfaces/window/regions/canvas/holds/header/tree/children/0/children/0"]],
  "frame.nothing_moved_since_it_was_approved": [[fixtures, "plugin-tab-in-nav1", "differs from the approved projection at /surfaces/window/regions/nav1/holds/section"]],
  "frame.a_slot_takes_only_what_it_declares": [[fixtures, "plugin-tab-in-nav1", "ui-tab's coverage is drawn in nav1/section; its slot is canvas/tabs"]],
  "frame.the_fixed_sections_come_first": [[broken, "plugin-section-first", "nav 1 offers [checks, settings, work, workflows]"]],
  "frame.no_region_is_lost_at_the_narrowest_width": [[fixtures, "never-draws-the-panel", "panel should be drawn now, and is not"]],
  "frame.keys_remaps_and_the_mouse_agree": [[broken, "deaf-to-the-mouse", "driven by mouse, it differs from the default keys"]],
  "frame.a_surface_is_drawn_only_where_declared": [[broken, "draws-a-menu-bar", "draws menubar, which it does not declare"]],
  "frame.a_projection_is_deterministic": [[broken, "restless", "the same script twice"]],
};

for (const [type, expectations] of Object.entries(checks)) {
  const missing = expectations.filter(([result, renderer, message]) => !said(result, type, renderer, message));
  const ok = passedClean(type) && missing.length === 0;
  record(type, ok, ok ? undefined : { clean: passedClean(type), unseen: missing.map(([, renderer, message]) => `${renderer}: ${message}`) });
}

const failed = assertions.filter((each) => each.status === "failed").length;
const report = {
  scenario: "ui-frame",
  status: failed === 0 ? "passed" : "failed",
  goal: "Prove that every renderer is the window the frame declares: a renderer that draws exactly the frame passes the script by default keys, by a remapped keymap and by the mouse, twice with identical projections, and one that moves a region, invents one, loses one, rebinds enter, misplaces a plugin's tab or disagrees with another renderer fails naming what it broke.",
  artifact: {
    packages: ["@amykit/ui", "@amykit/ui-conformance", "@amykit/plugin-ui-stub"],
    entry: "amy-ui-conformance, the bin npm linked from the installed @amykit/ui-conformance",
  },
  observed: {
    clean: { exit: clean.code, renderers: clean.report.renderers.map((each) => each.name) },
    fixtures: { exit: fixtures.code, renderers: fixtures.report.renderers.map((each) => each.name), findings: fixtures.report.findings.length },
    broken: { exit: broken.code, renderers: broken.report.renderers.map((each) => each.name), findings: broken.report.findings.length },
    pair: { exit: pair.code, renderers: pair.report.renderers.map((each) => each.name), findings: pair.report.findings.length },
    assertions_run: assertions.length,
    assertions_failed: failed,
    node: process.version,
  },
  assertions,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failed > 0) {
  console.error(JSON.stringify(assertions.filter((each) => each.status === "failed"), null, 2));
  if (clean.code !== 0) console.error(clean.stderr);
  process.exit(1);
}
console.log(`ui-frame: ${assertions.length} assertions passed`);
