import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

// What `sf verify` says is proven by `sf verify`, which runs each rule against
// its fixture; this suite holds the rules, the fixtures and the lock scope to
// what docs/design/the-frame-is-closed.md says they are.
const repo = path.resolve(import.meta.dirname, "../../..");
const factory = path.join(repo, ".software-factory");
const read = (file: string): string => fs.readFileSync(path.join(repo, file), "utf-8");

interface Policy {
  readonly rules: Record<string, { enabled: boolean; options?: { scope?: string[]; run?: string } }>;
  readonly gates: Record<string, { activation: string[]; required_assertions: string[] }>;
}

interface Rule {
  readonly id: string;
  readonly check: { readonly kind: string };
  readonly defaults: {
    readonly scope?: readonly string[];
    readonly exclude?: readonly string[];
    readonly run?: string;
    readonly forbidden?: readonly { readonly regex: string }[];
  };
}

const policy = YAML.parse(read(".software-factory/policy.yaml")) as Policy;
const rule = (file: string): Rule => YAML.parse(read(`.software-factory/rules/${file}.yaml`)) as Rule;

function refuses(found: Rule): (source: string) => boolean {
  // The patterns are fixed text in a file this repository locks, not input.
  // eslint-disable-next-line security/detect-non-literal-regexp -- the regexes are the rule's own, read from a locked file
  const patterns = (found.defaults.forbidden ?? []).map((entry) => new RegExp(entry.regex));
  return (source) => patterns.some((pattern) => pattern.test(source));
}

/** A fixture enables its rule and nothing else, and carries the rule exactly as this repository has it. */
function expectFixture(id: string, file: string): string {
  const fixture = path.join(factory, "mutations", id);
  const own = YAML.parse(fs.readFileSync(path.join(fixture, ".software-factory/policy.yaml"), "utf-8")) as { rules: object };
  expect(own.rules).toEqual({ [id]: { enabled: true } });
  expect(fs.readFileSync(path.join(fixture, `.software-factory/rules/${file}.yaml`), "utf-8")).toBe(read(`.software-factory/rules/${file}.yaml`));
  return fixture;
}

describe("the frame is locked", () => {
  const scope = policy.rules["L2.GENERATED_FILES_ARE_LOCKED"]?.options?.scope ?? [];

  it("puts the frame, the golden and the conformance config in the generated-files lock", () => {
    expect(scope).toEqual(expect.arrayContaining(["packages/ui/frame.yaml", "packages/ui/conformance/golden.json", "packages/ui/conformance/config.yaml"]));
    const lock = JSON.parse(read(".software-factory/locks/generated.lock.json")) as { files: Record<string, string> };
    expect(Object.keys(lock.files)).toEqual(expect.arrayContaining(["packages/ui/frame.yaml", "packages/ui/conformance/golden.json"]));
  });

  it("has a fixture where the frame was edited without its lock", () => {
    const fixture = path.join(factory, "mutations/L2.GENERATED_FILES_ARE_LOCKED");
    const own = YAML.parse(fs.readFileSync(path.join(fixture, ".software-factory/policy.yaml"), "utf-8")) as Policy;
    const lock = JSON.parse(fs.readFileSync(path.join(fixture, ".software-factory/locks/generated.lock.json"), "utf-8")) as { files: Record<string, string> };

    expect(own.rules["L2.GENERATED_FILES_ARE_LOCKED"]?.options?.scope).toContain("packages/ui/frame.yaml");
    expect(fs.readFileSync(path.join(fixture, "packages/ui/frame.yaml"), "utf-8")).toMatch(/nav2:\s*\{ place: right/);
    expect(lock.files["packages/ui/frame.yaml"]).toBe("0".repeat(64));
  });

  it("ships the frame and the golden with @amykit/ui, and the harness that reads them beside it", () => {
    const ui = JSON.parse(read("packages/ui/package.json")) as { files: string[]; exports: Record<string, unknown>; dependencies?: object };
    const harness = JSON.parse(read("packages/ui-conformance/package.json")) as { bin: Record<string, string>; dependencies: Record<string, string> };

    expect(ui.files).toEqual(expect.arrayContaining(["frame.yaml", "conformance"]));
    expect(ui.exports["./frame.yaml"]).toBe("./frame.yaml");
    expect(ui.dependencies).toBeUndefined();
    expect(harness.bin["amy-ui-conformance"]).toBe("./dist/cli.js");
    expect(Object.keys(harness.dependencies)).toEqual(["@amykit/ui", "yaml"]);
  });
});

describe("a renderer only translates", () => {
  const found = rule("a-renderer-only-translates");
  const refused = refuses(found);

  it("is enabled, over every renderer plugin's source", () => {
    expect(found.id).toBe("L0.A_RENDERER_ONLY_TRANSLATES");
    expect(policy.rules[found.id]).toEqual({ enabled: true });
    expect(found.defaults.scope).toEqual(["plugins/ui-*/src/**"]);
  });

  it("has a fixture that imports a workflow and the harness", () => {
    const source = fs.readFileSync(path.join(expectFixture(found.id, "a-renderer-only-translates"), "plugins/ui-peek/src/index.ts"), "utf-8");
    expect(source.split("\n").filter(refused)).toHaveLength(2);
  });

  it.each([
    ['import { STATES } from "@amykit/workflow-ticket-to-qa";', true],
    ["import { GitHub } from '@amykit/plugin-github';", true],
    ['import { loadGolden } from "@amykit/ui-conformance";', true],
    ['import { element } from "@amykit/ui/dist/tree.js";', true],
    ['import { element, type Node } from "@amykit/ui";', false],
    ['import { buildKeymap } from "@amykit/ui/frame";', false],
    ['import { jsx } from "@amykit/ui/jsx-runtime";', false],
  ])("%s refused: %s", (source, expected) => {
    expect(refused(source)).toBe(expected);
  });
});

describe("a renderer names no colour", () => {
  const found = rule("a-renderer-names-no-colour");
  const refused = refuses(found);

  it("is enabled over renderer sources, its theme-token file excepted", () => {
    expect(found.id).toBe("L0.A_RENDERER_NAMES_NO_COLOUR");
    expect(policy.rules[found.id]).toEqual({ enabled: true });
    expect(found.defaults.scope).toEqual(["plugins/ui-*/src/**"]);
    expect(found.defaults.exclude).toEqual(["plugins/ui-*/src/theme.*", "plugins/ui-*/src/theme/**"]);
  });

  it("has a fixture whose row picks its own red, beside a theme that may", () => {
    const fixture = expectFixture(found.id, "a-renderer-names-no-colour");
    expect(refused(fs.readFileSync(path.join(fixture, "plugins/ui-red/src/row.ts"), "utf-8"))).toBe(true);
    expect(refused(fs.readFileSync(path.join(fixture, "plugins/ui-red/src/theme.ts"), "utf-8"))).toBe(true);
  });

  it.each([
    ['const red = "#f00";', true],
    ["border: '#1f2328',", true],
    ["background: rgb(255, 0, 0)", true],
    ["fill: oklch(0.6 0.2 25)", true],
    ['const bold = "\\x1b[31m";', true],
    ['<Text color="red">', true],
    ["{ backgroundColor: 'greenBright' }", true],
    ['<Text tone="danger">', false],
    ["const issue = `#${number}`;", false],
    ["color: tokens.danger", false],
  ])("%s refused: %s", (source, expected) => {
    expect(refused(source)).toBe(expected);
  });
});

describe("every renderer holds the frame", () => {
  const found = rule("every-renderer-holds-the-frame");

  it("is a command that runs the conformance harness from the repository's root", () => {
    expect(found.id).toBe("L1.EVERY_RENDERER_HOLDS_THE_FRAME");
    expect(found.check.kind).toBe("command");
    expect(policy.rules[found.id]).toEqual({ enabled: true });
    expect(found.defaults.run).toBe('node "$(git rev-parse --show-toplevel)/packages/ui-conformance/dist/cli.js"');
  });

  it("has a fixture workspace with the four broken renderers and no other", () => {
    const fixture = expectFixture(found.id, "every-renderer-holds-the-frame");
    expect(fs.readdirSync(path.join(fixture, "plugins")).sort()).toEqual(["ui-enter-decides", "ui-nav-on-the-right", "ui-no-panel", "ui-tab-in-nav1"]);
  });
});

describe("the ui-frame gate", () => {
  const gate = policy.gates["ui-frame"];

  it("is activated by the frame, the harness and every renderer's source", () => {
    expect(gate?.activation).toEqual(["packages/ui/**", "packages/ui-conformance/src/**", "plugins/ui-*/src/**"]);
  });

  it("requires every assertion the conformance script makes", async () => {
    const { ASSERTIONS } = await import("@amykit/ui-conformance");
    expect(gate?.required_assertions).toEqual([...ASSERTIONS]);
  });
});
