#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { conform } from "./conform.js";
import { discover, FILES, goldenText, loadConformance, loadFrame, loadGolden, renderersIn } from "./files.js";

/**
 * amy-ui-conformance: drive every renderer in a workspace through the frame's
 * script and fail, naming what broke, unless each one is the window that was
 * agreed.
 *
 *   --root <dir>      the workspace whose plugins/ui-* are measured (default: here)
 *   --renderer <file> measure the renderers this module exports instead; repeatable
 *   --report <file>   also write the report as JSON
 *   --approve         write the first renderer's projections as the approved golden
 */
interface Options {
  readonly root: string;
  readonly renderers: readonly string[];
  readonly report?: string;
  readonly approve: boolean;
}

function options(argv: readonly string[]): Options {
  let root = process.cwd();
  const renderers: string[] = [];
  let report: string | undefined;
  let approve = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--approve") approve = true;
    else if (value === undefined) throw new TypeError(`${flag} needs a value`);
    else if (flag === "--root") root = value;
    else if (flag === "--renderer") renderers.push(value);
    else if (flag === "--report") report = value;
    else throw new TypeError(`${flag} is not an option`);
    if (flag !== "--approve") i += 1;
  }
  return { root, renderers, approve, ...(report === undefined ? {} : { report }) };
}

async function main(): Promise<number> {
  const { root, renderers: modules, report: reportFile, approve } = options(process.argv.slice(2));
  const frame = loadFrame();
  const renderers = modules.length > 0 ? (await Promise.all(modules.map(renderersIn))).flat() : await discover(path.resolve(root));
  if (renderers.length === 0) {
    console.error(`amy-ui-conformance: no renderer to measure under ${path.resolve(root)}`);
    return 1;
  }
  const config = loadConformance();
  if (approve) {
    const first = conform(frame, renderers, config, undefined).projections;
    const steps = Object.values(first)[0] ?? [];
    fs.writeFileSync(FILES.golden, goldenText({ steps }));
    console.log(`approved ${steps.length} projections into ${FILES.golden}; lock it with \`sf lock\``);
  }
  const report = conform(frame, renderers, config, loadGolden());
  if (reportFile !== undefined) fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  for (const finding of report.findings) {
    const where = [finding.renderer, finding.run, finding.step].filter(Boolean).join(" · ");
    console.error(`${finding.assertion}: ${where}: ${finding.message}`);
  }
  const names = report.renderers.map((renderer) => renderer.name).join(", ");
  if (report.findings.length > 0) {
    console.error(`\n${report.findings.length} finding(s) across ${names}: the window is not the one the frame declares`);
    return 1;
  }
  console.log(`${names}: every assertion of the frame holds, three ways and twice`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`amy-ui-conformance: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
