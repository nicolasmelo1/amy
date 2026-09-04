import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv, parseEnv } from "../src/env.js";

describe("parseEnv", () => {
  it("reads a plain assignment", () => {
    expect(parseEnv("LINEAR_API_KEY=abc123")).toEqual({ LINEAR_API_KEY: "abc123" });
  });

  it("ignores blank lines and comments", () => {
    const contents = ["# a comment", "", "  ", "KEY=value", "# another"].join("\n");

    expect(parseEnv(contents)).toEqual({ KEY: "value" });
  });

  it("accepts a leading export, as a shell-sourced file has", () => {
    expect(parseEnv("export KEY=value")).toEqual({ KEY: "value" });
  });

  it("strips surrounding quotes of either kind", () => {
    expect(parseEnv('A="one"\nB=\'two\'')).toEqual({ A: "one", B: "two" });
  });

  it("keeps a quote that is only on one side", () => {
    expect(parseEnv('A="one')).toEqual({ A: '"one' });
  });

  it("keeps an equals sign inside the value", () => {
    expect(parseEnv("KEY=a=b=c")).toEqual({ KEY: "a=b=c" });
  });

  it("keeps an empty value", () => {
    expect(parseEnv("KEY=")).toEqual({ KEY: "" });
  });

  it("skips a line with no key", () => {
    expect(parseEnv("=orphan")).toEqual({});
  });

  it("skips a name that is not a valid variable", () => {
    expect(parseEnv("not a key=value\n9LIVES=x")).toEqual({});
  });

  it("lets a later line win", () => {
    expect(parseEnv("KEY=first\nKEY=second")).toEqual({ KEY: "second" });
  });
});

describe("loadEnv", () => {
  let root: string;
  const KEY = "AMY_TEST_KEY";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-env-"));
    delete process.env[KEY];
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env[KEY];
  });

  it("does nothing when there is no file", () => {
    expect(loadEnv(root)).toEqual([]);
  });

  it("puts the file's values into the environment", () => {
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from-file`);

    expect(loadEnv(root)).toEqual([KEY]);
    expect(process.env[KEY]).toBe("from-file");
  });

  it("lets an already exported value win, so overriding for one run works", () => {
    process.env[KEY] = "from-shell";
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from-file`);

    expect(loadEnv(root)).toEqual([]);
    expect(process.env[KEY]).toBe("from-shell");
  });

  it("reports the names it set and never the values", () => {
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=secret-value`);

    const applied = loadEnv(root);

    expect(applied).toEqual([KEY]);
    expect(applied.join()).not.toContain("secret-value");
  });
});
