import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

// What `sf verify` says is proven by `sf verify`, which runs the rule against
// its fixture; this suite holds the rule and the fixture to what they claim.
const repo = path.resolve(import.meta.dirname, "../../..");
const ID = "L0.A_VIEW_DRAWS_NOTHING";
const ruleFile = path.join(repo, ".software-factory/rules/a-view-draws-nothing.yaml");
const fixture = path.join(repo, ".software-factory/mutations", ID);

interface Rule {
  readonly id: string;
  readonly defaults: { readonly scope: readonly string[]; readonly forbidden: readonly { readonly regex: string }[] };
}

const rule = YAML.parse(fs.readFileSync(ruleFile, "utf-8")) as Rule;
// The patterns are fixed text in a file this repository locks, not input.
// eslint-disable-next-line security/detect-non-literal-regexp -- the regexes are the rule's own, read from a locked file
const patterns = rule.defaults.forbidden.map((entry) => new RegExp(entry.regex));
const refused = (source: string) => patterns.some((pattern) => pattern.test(source));

describe("a view draws nothing", () => {
  it("is enabled in this repository's policy", () => {
    const policy = YAML.parse(fs.readFileSync(path.join(repo, ".software-factory/policy.yaml"), "utf-8")) as {
      rules: Record<string, { enabled: boolean }>;
    };

    expect(rule.id).toBe(ID);
    expect(policy.rules[ID]).toEqual({ enabled: true });
  });

  it("watches every package and plugin source, the ui package included", () => {
    expect(rule.defaults.scope).toEqual(expect.arrayContaining(["packages/*/src/**", "plugins/*/src/**"]));
  });

  it("has a fixture that is a view importing react, enabling only this rule", () => {
    const view = fs.readFileSync(path.join(fixture, "packages/ui/src/views/status.tsx"), "utf-8");
    const policy = YAML.parse(fs.readFileSync(path.join(fixture, ".software-factory/policy.yaml"), "utf-8")) as { rules: object };

    expect(view).toMatch(/from "react"/);
    expect(refused(view)).toBe(true);
    expect(policy.rules).toEqual({ [ID]: { enabled: true } });
    expect(fs.readFileSync(path.join(fixture, ".software-factory/rules/a-view-draws-nothing.yaml"), "utf-8")).toBe(
      fs.readFileSync(ruleFile, "utf-8"),
    );
  });

  it.each([
    ['import React from "react";'],
    ["import { render } from 'ink';"],
    ['import { createRoot } from "react-dom/client";'],
    ['const { View } = require("react-native");'],
    ['const vue = await import("vue");'],
    ['/** @jsxImportSource preact */'],
    ['"jsxImportSource": "react"'],
  ])("refuses a renderer however it is named: %s", (source) => {
    expect(refused(source)).toBe(true);
  });

  it.each([
    ['import { Stack } from "@amykit/ui";'],
    ['"jsxImportSource": "@amykit/ui"'],
    ['await this.api.call("reactions.get", {});'],
    ['import { reactive } from "./reactive.js";'],
  ])("lets through what only looks like one: %s", (source) => {
    expect(refused(source)).toBe(false);
  });
});

/** A package's compiler options, its own over the ones it extends. */
function compilerOptions(file: string): Record<string, unknown> {
  const config = JSON.parse(fs.readFileSync(file, "utf-8")) as { extends?: string; compilerOptions?: Record<string, unknown> };
  const inherited = config.extends ? compilerOptions(path.resolve(path.dirname(file), config.extends)) : {};
  return { ...inherited, ...config.compilerOptions };
}

/** What a package's JSX compiles against, or nothing when it compiles no JSX. */
function jsxRuntime(options: Record<string, unknown>): string | undefined {
  const jsx = options.jsx;
  if (jsx === undefined || jsx === "preserve") return undefined;
  if (jsx === "react-jsx" || jsx === "react-jsxdev") return typeof options.jsxImportSource === "string" ? options.jsxImportSource : "react";
  return "react";
}

describe("a view compiles against amy's runtime, never a renderer's by default", () => {
  const configs = ["packages", "plugins"].flatMap((root) =>
    fs
      .readdirSync(path.join(repo, root))
      .map((name) => path.join(repo, root, name, "tsconfig.json"))
      .filter((file) => fs.existsSync(file)),
  );

  it("finds the packages it reads", () => {
    expect(configs.map((file) => path.relative(repo, file))).toContain("packages/cli/tsconfig.json");
  });

  // The text rule sees a renderer named; it cannot see one left implied,
  // which is what `react-jsx` without `jsxImportSource` is.
  it("leaves no package compiling JSX against React by leaving the source out", () => {
    const offending = configs
      .map((file) => [path.relative(repo, file), jsxRuntime(compilerOptions(file))] as const)
      .filter(([, runtime]) => runtime !== undefined && runtime !== "@amykit/ui");

    expect(offending).toEqual([]);
  });

  it.each([
    [{ jsx: "react-jsx" }, "react"],
    [{ jsx: "react-jsxdev" }, "react"],
    [{ jsx: "react" }, "react"],
    [{ jsx: "react-jsx", jsxImportSource: "@amykit/ui" }, "@amykit/ui"],
    [{ jsx: "preserve" }, undefined],
    [{}, undefined],
  ])("reads %j as compiling against %s", (options, runtime) => {
    expect(jsxRuntime(options)).toBe(runtime);
  });

  it.each([['"jsx": "react"'], ['"jsx":"react-native"']])("refuses classic JSX by text too: %s", (source) => {
    expect(refused(source)).toBe(true);
  });

  it("lets the automatic runtime through to the check above", () => {
    expect(refused('"jsx": "react-jsx"')).toBe(false);
  });
});
