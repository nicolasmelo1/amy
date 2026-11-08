// The services' tests, run from the root of the tree a gate judges, with the
// core resolved from the repository the gate lives in.
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = process.cwd();
const repository = path.resolve(import.meta.dirname, "../../..");

export default defineConfig({
  root,
  test: {
    include: ["packages/services/tests/**/*.test.ts"],
    // The gates' own test drives these gates; run here it would recurse.
    exclude: ["**/node_modules/**", "packages/services/tests/gates.test.ts"],
  },
  resolve: {
    alias: {
      "@amykit/core": path.join(repository, "packages/core/src/index.ts"),
      "@amykit/plugin-file-store": path.join(repository, "plugins/file-store/src/index.ts"),
      "@amykit/services": path.join(root, "packages/services/src/index.ts"),
    },
  },
});
