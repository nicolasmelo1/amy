import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { envFiles, loadEnvFiles } from "../src/env.js";
import { profileEnv } from "../src/paths.js";

/** The falsifier this property must reject, planted only when the rule names it. */
const FALSIFIER = "the_general_env_wins";
const generalFirst = process.env.SF_FALSIFIER === FALSIFIER;

const KEY = "AMY_PROPERTY_KEY";

/** A value only one of the four places would carry. */
const carried = fc.constantFrom("one", "two", "three", "four", "five", "six");

describe("the first place that sets a key is the one the process keeps", () => {
  let roots: string[] = [];

  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots = [];
    delete process.env[KEY];
  });

  it("reads exported, then the project's .env, then the profile's, then the machine's (A5)", () => {
    const property = fc.property(
      fc.option(carried, { nil: null }),
      fc.option(carried, { nil: null }),
      fc.option(carried, { nil: null }),
      fc.option(carried, { nil: null }),
      (exported, project, profile, machine) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-env-layers-"));
        roots.push(root);
        const projectDirectory = path.join(root, "project");
        fs.mkdirSync(path.join(root, "profiles", "work"), { recursive: true });
        fs.mkdirSync(projectDirectory, { recursive: true });

        delete process.env[KEY];
        if (exported !== null) process.env[KEY] = exported;
        if (project !== null) fs.writeFileSync(path.join(projectDirectory, ".env"), `${KEY}=${project}`);
        if (profile !== null) fs.writeFileSync(profileEnv(root, "work"), `${KEY}=${profile}`);
        if (machine !== null) fs.writeFileSync(path.join(root, ".env"), `${KEY}=${machine}`);

        // The mutation is the order this read had before profiles had files:
        // the machine's file read first, so it won every key it carried. It
        // reads the same four files, so a property that passes under it never
        // had two of them set the same key.
        const files = envFiles(root, { profile: "work", cwd: projectDirectory });
        loadEnvFiles(generalFirst ? [...files].reverse() : files);

        expect(process.env[KEY]).toBe(exported ?? project ?? profile ?? machine ?? undefined);
      },
    );

    fc.assert(property, { numRuns: 100 });
  });
});
