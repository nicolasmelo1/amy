import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classify } from "../src/spec.js";

describe("a plugin spec", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-spec-"));
  });
  afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }));

  /** A directory npm would find a package in, with the entry the loader imports. */
  function packageAt(directory: string, manifest: object = { main: "./index.js" }): void {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(manifest)}\n`, "utf-8");
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
      "gitlab:acme/plugin-oncall",
      "bitbucket:acme/plugin-oncall",
      "git@example.test:acme/plugin-oncall.git",
      "https://example.test/acme/plugin-oncall.git",
      "https://example.test/acme/plugin-oncall#v2.1.0",
    ]) {
      expect(classify(spec, scratch)).toEqual({ kind: "git", install: spec, imported: undefined });
    }
  });

  it("classifies a tarball URL and names nothing yet", () => {
    // The shape decides it, not the suffix: whatever else an http(s) endpoint
    // that is not cloning serves, npm is the one that downloads it.
    for (const spec of [
      "https://example.com/plugin-oncall-2.1.0.tgz",
      "https://example.com/plugin-oncall-2.1.0.tar.gz",
      "https://example.com/plugin-oncall-2.1.0.tgz?token=abc",
      "http://example.com/plugin-oncall-2.1.0.tgz",
    ]) {
      expect(classify(spec, scratch)).toEqual({
        kind: "tarball",
        install: spec,
        imported: undefined,
      });
    }
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
      imported: pathToFileURL(path.join(scratch, "plugin-oncall", "index.js")).href,
      absolute: path.join(scratch, "plugin-oncall"),
    });
    expect(classify("packages/plugin-x", scratch)).toEqual({
      kind: "path",
      install: path.join(scratch, "packages/plugin-x"),
      imported: pathToFileURL(path.join(scratch, "packages", "plugin-x", "index.js")).href,
      absolute: path.join(scratch, "packages/plugin-x"),
    });
  });

  it("reads the package's own entry, and hands import() a file", () => {
    const directory = path.join(scratch, "custom");
    packageAt(directory, { main: "./src/entry.js" });
    fs.mkdirSync(path.join(directory, "src"), { recursive: true });
    fs.writeFileSync(path.join(directory, "src", "entry.js"), "export {};\n", "utf-8");

    expect(classify("./custom", scratch)).toEqual({
      kind: "path",
      install: directory,
      imported: pathToFileURL(path.join(directory, "src/entry.js")).href,
      absolute: directory,
    });
    expect(classify("./custom", scratch).imported).toMatch(/^file:\/\//);
  });

  it("reads the entry through exports, the way Node does", () => {
    const direct = path.join(scratch, "exports-direct");
    packageAt(direct, { exports: "./dist/plugin.js" });
    fs.mkdirSync(path.join(direct, "dist"), { recursive: true });
    fs.writeFileSync(path.join(direct, "dist", "plugin.js"), "export {};\n", "utf-8");

    const conditional = path.join(scratch, "exports-conditional");
    packageAt(conditional, { exports: { ".": { import: "./esm/plugin.js" } } });
    fs.mkdirSync(path.join(conditional, "esm"), { recursive: true });
    fs.writeFileSync(path.join(conditional, "esm", "plugin.js"), "export {};\n", "utf-8");

    const declared = path.join(scratch, "exports-declared");
    packageAt(declared, { exports: { ".": { node: "./node/plugin.js", default: "./fallback/plugin.js" } } });
    for (const dir of ["node", "fallback"]) {
      fs.mkdirSync(path.join(declared, dir), { recursive: true });
      fs.writeFileSync(path.join(declared, dir, "plugin.js"), "export {};\n", "utf-8");
    }

    const nested = path.join(scratch, "exports-nested");
    packageAt(nested, { exports: { ".": { node: { import: "./node-esm/plugin.js" }, default: "./fallback/plugin.js" } } });
    fs.mkdirSync(path.join(nested, "node-esm"), { recursive: true });
    fs.writeFileSync(path.join(nested, "node-esm", "plugin.js"), "export {};\n", "utf-8");

    const subpathOnly = path.join(scratch, "exports-subpath");
    packageAt(subpathOnly, { exports: { "./lib.js": "./lib/plugin.js" } });

    const escaping = path.join(scratch, "exports-escaping");
    packageAt(escaping, { exports: "./../../outside.js" });

    expect(classify("./exports-direct", scratch).imported).toBe(
      pathToFileURL(path.join(direct, "dist/plugin.js")).href,
    );
    expect(classify("./exports-conditional", scratch).imported).toBe(
      pathToFileURL(path.join(conditional, "esm/plugin.js")).href,
    );
    expect(classify("./exports-declared", scratch).imported).toBe(
      pathToFileURL(path.join(declared, "node/plugin.js")).href,
    );
    expect(classify("./exports-nested", scratch).imported).toBe(
      pathToFileURL(path.join(nested, "node-esm/plugin.js")).href,
    );
    expect(() => classify("./exports-subpath", scratch)).toThrow(
      `${subpathOnly} carries an exports map that names no root`,
    );
    expect(() => classify("./exports-escaping", scratch)).toThrow(
      `${escaping} carries an exports target outside the package`,
    );
  });

  it("refuses a package.json it cannot read, rather than resolving past it", () => {
    const directory = path.join(scratch, "unreadable");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), "{ not json\n", "utf-8");

    expect(() => classify("./unreadable", scratch)).toThrow(
      `${directory} carries a package.json that cannot be read`,
    );
  });

  it("reads the caller's package for a bare dot", () => {
    packageAt(scratch);

    expect(classify(".", scratch)).toEqual({
      kind: "path",
      install: scratch,
      imported: pathToFileURL(path.join(scratch, "index.js")).href,
      absolute: scratch,
    });
    expect(() => classify("..", scratch)).toThrow(/is not a package/);
  });

  it("expands only a bare tilde or one with a slash after it", () => {
    // The home the expansion reads is the process's own, which is the
    // platform's home variable — HOME on Unix, USERPROFILE on Windows.
    // Pointed at the scratch directory for the duration, the test neither
    // depends on nor deletes anything under the developer's real home.
    const variable = process.platform === "win32" ? "USERPROFILE" : "HOME";
    const real = process.env[variable];
    const home = path.join(scratch, "amy-spec-home");
    packageAt(path.join(home, "plugin"));
    packageAt(path.join(scratch, "~owner", "plugin"));

    try {
      process.env[variable] = scratch;
      expect(classify("~/amy-spec-home/plugin", scratch)).toEqual({
        kind: "path",
        install: path.join(home, "plugin"),
        imported: pathToFileURL(path.join(home, "plugin", "index.js")).href,
        absolute: path.join(home, "plugin"),
      });
      expect(classify("~owner/plugin", scratch)).toEqual({
        kind: "path",
        install: path.join(scratch, "~owner/plugin"),
        imported: pathToFileURL(path.join(scratch, "~owner", "plugin", "index.js")).href,
        absolute: path.join(scratch, "~owner/plugin"),
      });
    } finally {
      if (real === undefined) delete process.env[variable];
      else process.env[variable] = real;
      fs.rmSync(path.join(scratch, "~owner"), { recursive: true, force: true });
    }
  });

  it("reads a file: spec as the package on this disk", () => {
    const directory = path.join(scratch, "local-plugin");
    packageAt(directory);

    expect(classify("file:./local-plugin", scratch)).toEqual({
      kind: "path",
      install: directory,
      imported: pathToFileURL(path.join(directory, "index.js")).href,
      absolute: directory,
    });
    expect(classify("file:./local-plugin", scratch).imported).toMatch(/^file:\/\//);
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
    // same spec read as a name with a range would have answered `range`. The
    // fixture is built inside the scratch directory on every platform — a
    // drive-qualified seed would land at the root of C: on Windows itself.
    const inside =
      process.platform === "win32"
        ? path.join(scratch, "dev", "plugin-oncall")
        : path.join(scratch, "C:", "dev", "plugin-oncall");
    fs.mkdirSync(inside, { recursive: true });
    fs.writeFileSync(path.join(inside, "package.json"), "{}\n", "utf-8");
    fs.writeFileSync(path.join(inside, "index.js"), "export {};\n", "utf-8");
    const spec = process.platform === "win32" ? inside.replaceAll("/", "\\") : "C:\\dev\\plugin-oncall";

    expect(classify(spec, scratch)).toEqual({
      kind: "path",
      install: inside,
      imported: pathToFileURL(path.join(inside, "index.js")).href,
      absolute: inside,
    });
  });
});