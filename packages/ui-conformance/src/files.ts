import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { checkFrame, type ConformanceRenderer, type Frame, type KeyOverrides } from "@amykit/ui/frame";
import type { Conformance, Golden } from "./conform.js";

/** Where @amykit/ui is installed beside this package: the frame and what was approved from it ship there. */
const UI = path.dirname(createRequire(import.meta.url).resolve("@amykit/ui/frame.yaml"));

/** The frame, the conformance config and the approved projection: all three ship with @amykit/ui and are locked. */
export const FILES = {
  frame: path.join(UI, "frame.yaml"),
  config: path.join(UI, "conformance", "config.yaml"),
  golden: path.join(UI, "conformance", "golden.json"),
};

export function loadFrame(file = FILES.frame): Frame {
  return checkFrame(YAML.parse(fs.readFileSync(file, "utf-8")));
}

export function loadConformance(file = FILES.config): Conformance {
  const parsed = YAML.parse(fs.readFileSync(file, "utf-8")) as { ui?: { sections?: string[]; keys?: KeyOverrides } };
  return { ...(parsed.ui?.sections === undefined ? {} : { sections: parsed.ui.sections }), keys: parsed.ui?.keys ?? {} };
}

export function loadGolden(file = FILES.golden): Golden | undefined {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as Golden) : undefined;
}

/** The approved projection, as the bytes a lock hashes: the same projections are always the same file. */
export function goldenText(golden: Golden): string {
  return `${JSON.stringify(golden, null, 2)}\n`;
}

function isRenderer(value: unknown): value is ConformanceRenderer {
  return typeof value === "object" && value !== null && typeof (value as ConformanceRenderer).start === "function" && typeof (value as ConformanceRenderer).name === "string";
}

/** The renderers a module exports as `renderers`. */
export async function renderersIn(file: string): Promise<readonly ConformanceRenderer[]> {
  const module = (await import(pathToFileURL(path.resolve(file)).href)) as { renderers?: unknown };
  const found = Array.isArray(module.renderers) ? module.renderers : [];
  if (found.length === 0 || !found.every(isRenderer)) throw new TypeError(`${file} exports no conformance renderers`);
  return found;
}

/**
 * Every renderer in a workspace: each `plugins/ui-*` package, through the
 * module its `amy.conformance` names. Until the `ui-renderer` collection
 * exists, this list is the harness's own.
 */
export async function discover(root: string): Promise<readonly ConformanceRenderer[]> {
  const plugins = path.join(root, "plugins");
  if (!fs.existsSync(plugins)) return [];
  const modules = fs
    .readdirSync(plugins)
    .filter((entry) => entry.startsWith("ui-"))
    .sort()
    .flatMap((entry) => {
      const manifest = path.join(plugins, entry, "package.json");
      if (!fs.existsSync(manifest)) return [];
      const conformance = (JSON.parse(fs.readFileSync(manifest, "utf-8")) as { amy?: { conformance?: string } }).amy?.conformance;
      return conformance === undefined ? [] : [path.join(plugins, entry, conformance)];
    });
  return (await Promise.all(modules.map(renderersIn))).flat();
}
