import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { itemFile, publicPackages, registryItem, serialize, staleItems } from "../src/registry-item.js";
import { CORE_RANGE } from "./core-version.js";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));

/** The files the generator reads: what git tracks, and what it would track, under the packages. */
function tracked(root: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "packages", "plugins", "examples"], { cwd: root, encoding: "utf-8" })
    .split("\0")
    .filter((file) => file && fs.existsSync(path.join(root, file)));
}

describe("the registry items every published package ships", () => {
  it("are all current: each is its package's source at its version", () => {
    expect(staleItems(REPOSITORY, tracked(REPOSITORY))).toEqual([]);
    expect(publicPackages(REPOSITORY)).toContain("plugins/linear");
  });

  describe("in a repository of their own", () => {
    let root: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-registry-"));
      const pager = path.join(root, "plugins", "pager");
      fs.mkdirSync(path.join(pager, "src"), { recursive: true });
      fs.mkdirSync(path.join(pager, "tests"), { recursive: true });
      fs.writeFileSync(path.join(pager, "package.json"), JSON.stringify({
        name: "@acme/plugin-pager", version: "1.4.0", description: "pages",
        repository: { type: "git", url: "git+https://example.test/acme.git", directory: "plugins/pager" },
        dependencies: { "@amykit/core": CORE_RANGE },
        devDependencies: { "secret": "^1.0.0", "fast-check": "^4.0.0" },
      }));
      fs.writeFileSync(path.join(pager, "src", "index.ts"), "export const said = 1;\n");
      fs.writeFileSync(path.join(pager, "tests", "index.test.ts"), "// not shipped\n");
      fs.writeFileSync(path.join(pager, "CHANGELOG.md"), "# not shipped\n");
      fs.mkdirSync(path.join(root, "plugins", "secret"));
      fs.writeFileSync(path.join(root, "plugins", "secret", "package.json"), JSON.stringify({ name: "secret", private: true }));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    const files = () => ["plugins/pager/package.json", "plugins/pager/src/index.ts", "plugins/pager/tests/index.test.ts", "plugins/pager/CHANGELOG.md", "plugins/secret/package.json"];

    it("holds the source, not the tests or the changelog, at the version its tag names", () => {
      const item = registryItem(root, "plugins/pager", files());

      expect(publicPackages(root)).toEqual(["plugins/pager"]);
      expect(item.files.map((file) => [file.path, file.target])).toEqual([
        ["plugins/pager/package.json", "forks/plugin-pager/package.json"],
        ["plugins/pager/src/index.ts", "forks/plugin-pager/src/index.ts"],
      ]);
      expect(item.files[1]!.content).toBe("export const said = 1;\n");
      expect(item.dependencies).toEqual([`@amykit/core@${CORE_RANGE}`]);
      // `secret` is the workspace's private package: no client outside it could install it.
      expect(item.devDependencies).toEqual(["fast-check@^4.0.0"]);
      expect(item.meta).toEqual({ package: "@acme/plugin-pager", version: "1.4.0", repository: "git+https://example.test/acme.git", directory: "plugins/pager", tag: "@acme/plugin-pager@1.4.0" });
    });

    it("turns stale when its source moves, naming the item", () => {
      const item = registryItem(root, "plugins/pager", files());
      fs.mkdirSync(path.join(root, "registry"));
      fs.writeFileSync(itemFile(root, item), serialize(item));
      expect(staleItems(root, files())).toEqual([]);

      fs.writeFileSync(path.join(root, "plugins", "pager", "src", "index.ts"), "export const said = 2;\n");

      expect(staleItems(root, files())).toEqual(["registry/plugin-pager.json (@acme/plugin-pager@1.4.0)"]);
    });
  });
});
