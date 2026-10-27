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
