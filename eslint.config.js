import eslint from "@eslint/js";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "node_modules/**",
      ".amy/**",
      // Deliberately broken repositories, one per rule. Linting them would
      // report the fixtures as defects.
      ".software-factory/mutations/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Known-insecure patterns: a child process built from a string, a path
  // taken from input, a RegExp compiled from a variable. This repository
  // shells out to `gh`, `claude` and `git` and writes files under paths a
  // config names, which is exactly the surface these rules read.
  security.configs.recommended,
  {
    rules: {
      // Off, with the reason, rather than 75 warnings nobody reads. This
      // program is a file-backed queue, store and log: every path it touches
      // is computed from a configured directory, and the rule cannot tell
      // that from a path a stranger typed. Keeping it on would bury the
      // findings below, which are the ones worth having.
      "security/detect-non-literal-fs-filename": "off",
      // Same trade. Every hit here is `map[key]` where the key is a union
      // the compiler already checks, and the rule cannot see a type.
      "security/detect-object-injection": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  { files: ["**/tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // The end-to-end scenarios are node programs a shell script runs, not part
  // of any workspace, so nothing else declares what globals they have. Linted
  // rather than excluded: they are the code that proves the product works.
  {
    files: [".software-factory/evidence/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
