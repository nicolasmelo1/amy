import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv, parseEnv } from "../src/env.js";
import { environmentFor, envFiles, loadEnvFiles } from "../src/env.js";
import { profileEnv } from "../src/paths.js";

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

  /** One profile's own directory, with the file it carries. */
  function profileFile(name: string, contents: string): string {
    const file = profileEnv(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  }

  it("reads the project's key before the profile's before the machine's (A5)", () => {
    const project = path.join(root, "project");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, ".env"), `${KEY}=from-project`);
    profileFile("work", `${KEY}=from-profile`);
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from-machine`);

    loadEnvFiles(envFiles(root, { profile: "work", cwd: project }));

    expect(process.env[KEY]).toBe("from-project");
  });

  it("lets the profile's key beat the machine's, and the machine's answer when the profile has none (A5)", () => {
    const project = path.join(root, "project");
    fs.mkdirSync(project, { recursive: true });
    profileFile("work", "PROFILE_KEY=from-profile");
    fs.writeFileSync(path.join(root, ".env"), `PROFILE_KEY=from-machine\nMACHINE_KEY=from-machine\n`);
    delete process.env.PROFILE_KEY;
    delete process.env.MACHINE_KEY;

    try {
      loadEnvFiles(envFiles(root, { profile: "work", cwd: project }));

      expect(process.env.PROFILE_KEY).toBe("from-profile");
      expect(process.env.MACHINE_KEY).toBe("from-machine");
    } finally {
      delete process.env.PROFILE_KEY;
      delete process.env.MACHINE_KEY;
    }
  });

  it("leaves another profile's key unset in a process started for this one (A6)", () => {
    profileFile("work", "WORK_ONLY=1\nSHARED_KEY=from-work");
    profileFile("home", "HOME_ONLY=2\nSHARED_KEY=from-home");
    fs.writeFileSync(path.join(root, ".env"), "SHARED_KEY=from-machine\n");

    // The parent is what a process for `work` looks like: its own file has
    // already been applied, so the names it set are the ones a child must not
    // inherit when it drives another profile.
    const env = environmentFor(root, "home", {
      base: { PATH: "/bin", WORK_ONLY: "1", SHARED_KEY: "from-work" },
      fromFiles: ["WORK_ONLY", "SHARED_KEY"],
    });

    expect(env.WORK_ONLY).toBeUndefined();
    expect(env.HOME_ONLY).toBe("2");
    expect(env.SHARED_KEY).toBe("from-home");
    expect(env.PATH).toBe("/bin");
  });

  it("keeps a key the operator exported in a process started for another profile (A6)", () => {
    profileFile("work", "WORK_ONLY=1");
    profileFile("home", "HOME_ONLY=2");

    const env = environmentFor(root, "home", {
      base: { EXPORTED_KEY: "from-shell" },
      // Not in `fromFiles`: it came from the shell, not from a file.
      fromFiles: [],
    });

    expect(env.EXPORTED_KEY).toBe("from-shell");
  });
});
