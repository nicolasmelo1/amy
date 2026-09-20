import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classify } from "../src/spec.js";

describe("a plugin spec", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-spec-"));
  });
  afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }));

  function packageAt(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), "{}\n", "utf-8");
  }

  it("gives a bare package name to npm and to the config", () => {
    expect(classify("plugin-oncall", scratch)).toEqual({
      kind: "name",
      install: "plugin-oncall",
      imported: "plugin-oncall",
    });
    expect(classify("@acme/plugin-oncall", scratch)).toEqual({
      kind: "name",
      install: "@acme/plugin-oncall",
      imported: "@acme/plugin-oncall",
    });
  });

  it("installs a range and names the package", () => {
    expect(classify("plugin-oncall@2.1.0", scratch)).toEqual({
      kind: "range",
      install: "plugin-oncall@2.1.0",
      imported: "plugin-oncall",
    });
    expect(classify("@acme/plugin-oncall@^2", scratch)).toEqual({
      kind: "range",
      install: "@acme/plugin-oncall@^2",
      imported: "@acme/plugin-oncall",
    });
  });

  it("classifies a git URL and names nothing yet", () => {
    for (const spec of [
      "git+ssh://git@example.test/acme/plugin-oncall.git#semver:^2",
      "ssh://git@example.test/acme/plugin-oncall.git",
      "git+https://example.test/acme/plugin-oncall.git",
      "github:acme/plugin-oncall#v2.1.0",
      "git@example.test:acme/plugin-oncall.git",
      "https://example.test/acme/plugin-oncall.git",
      "https://example.test/acme/plugin-oncall#v2.1.0",
    ]) {
      expect(classify(spec, scratch)).toEqual({ kind: "git", install: spec, imported: undefined });
    }
  });

  it("classifies a tarball URL and names nothing yet", () => {
    expect(classify("https://example.com/plugin-oncall-2.1.0.tgz", scratch)).toEqual({
      kind: "tarball",
      install: "https://example.com/plugin-oncall-2.1.0.tgz",
      imported: undefined,
    });
  });

  it("resolves a relative path against the caller's directory", () => {
    packageAt(path.join(scratch, "plugin-oncall"));
    packageAt(path.join(scratch, "packages", "plugin-x"));

    expect(classify("plugin-oncall", path.join(scratch, "plugin-oncall"))).toEqual({
      kind: "name",
      install: "plugin-oncall",
      imported: "plugin-oncall",
    });
    expect(classify("./plugin-oncall", scratch)).toEqual({
      kind: "path",
      install: path.join(scratch, "plugin-oncall"),
      imported: path.join(scratch, "plugin-oncall"),
      absolute: path.join(scratch, "plugin-oncall"),
    });
    expect(classify("packages/plugin-x", scratch)).toEqual({
      kind: "path",
      install: path.join(scratch, "packages/plugin-x"),
      imported: path.join(scratch, "packages/plugin-x"),
      absolute: path.join(scratch, "packages/plugin-x"),
    });
  });

  it("refuses a path that is not a package, before anything is run", () => {
    fs.mkdirSync(path.join(scratch, "not-a-package"));
    fs.writeFileSync(path.join(scratch, "not-a-package", "index.js"), "export {};\n", "utf-8");

    expect(() => classify("./not-a-package", scratch)).toThrow(
      "./not-a-package is not a package: its package.json is missing at " + path.join(scratch, "not-a-package"),
    );
  });

  it("does not mistake a Windows-shaped path for a scoped name", () => {
    // A drive letter with a slash is a directory, so it resolves like one: the
    // package seeded where the caller's directory puts it is found, and the
    // same spec read as a name with a range would have answered `range`.
    const resolved = path.resolve(scratch, "C:/dev/plugin-oncall");
    packageAt(resolved);

    expect(classify("C:\\dev\\plugin-oncall", scratch)).toEqual({
      kind: "path",
      install: resolved,
      imported: resolved,
      absolute: resolved,
    });
  });
});