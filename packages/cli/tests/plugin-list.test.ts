import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pluginVersion } from "../src/loader.js";

describe("plugin versions", () => {
  it("reads each resolved package manifest and leaves a bare path unversioned", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-list-"));
    try {
      const home = path.join(root, "home");
      const plugins = path.join(home, "plugins");
      const installed = path.join(plugins, "node_modules", "@example", "plugin-one");
      const local = path.join(home, "workflows", "local");
      const bare = path.join(root, "bare");
      for (const dir of [installed, local, bare]) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(installed, "package.json"), JSON.stringify({ version: "0.6.0" }));
      fs.writeFileSync(path.join(local, "package.json"), JSON.stringify({ version: "2.3.4" }));
      fs.writeFileSync(path.join(local, "index.js"), "export const plugin = {};\n");
      fs.writeFileSync(path.join(bare, "index.js"), "export const plugin = {};\n");
      expect(pluginVersion(home, plugins, "@example/plugin-one")).toBe("0.6.0");
      expect(pluginVersion(home, plugins, "local")).toBe("2.3.4");
      expect(pluginVersion(home, plugins, bare)).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
