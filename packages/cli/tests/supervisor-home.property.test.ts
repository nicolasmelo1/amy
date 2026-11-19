import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { launcherOf, taskScheduler } from "../src/supervisor/windows.js";
import type { MachineFacts } from "../src/supervisor/index.js";

const FALSIFIER = "amy_home_taken_raw";
const planted = process.env.SF_FALSIFIER === FALSIFIER;
const LABEL = "amy-fixture";

/** `AMY_HOME` as a person or a shell may hand it over: padded, relative or absolute. */
const amyHomeValue = fc
  .tuple(
    fc.constantFrom("", " ", "  ", "\t", " \t "),
    fc.constantFrom("", ".", "~/state", "state"),
    fc.constantFrom("", " ", "  "),
  )
  .map(([before, value, after]) => `${before}${value}${after}`);

/** The mutation the property must reject: the raw value, joined as it arrived. */
function rawDirectory(machine: MachineFacts): string {
  const named = machine.env.AMY_HOME;
  return path.join(named ? named : path.join(machine.home, ".amy"), "supervisor");
}

/** What `amyHome` answers, with the machine's own home standing in for `os.homedir()`. */
function parsedDirectory(machine: MachineFacts): string {
  const named = machine.env.AMY_HOME?.trim();
  return path.join(named ? path.resolve(named) : path.join(machine.home, ".amy"), "supervisor");
}

const directoryOf = planted ? rawDirectory : parsedDirectory;

describe("the Windows supervisor's directory", () => {
  it(FALSIFIER, async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-supervisor-"));
    const previous = process.cwd();
    // Relative values resolve against where the command was typed, as they do
    // for a person; a scratch directory keeps that out of this checkout.
    process.chdir(base);
    try {
      await fc.assert(
        fc.asyncProperty(amyHomeValue, async (given) => {
          const calls: string[][] = [];
          const machine: MachineFacts = {
            platform: "win32",
            home: base,
            user: "fixture",
            uid: 0,
            env: { AMY_HOME: given },
            runner: {
              run: async (command: string, args: readonly string[]) => {
                calls.push([command, ...args]);
                return { ok: true, exitCode: 0, stdout: "", stderr: "" };
              },
            },
          };

          await taskScheduler(machine).stop(`${LABEL}-${Buffer.from(given).toString("hex")}`);

          const label = `${LABEL}-${Buffer.from(given).toString("hex")}`;
          const directory = directoryOf(machine);
          expect(fs.existsSync(path.join(directory, `${label}.stopped`))).toBe(true);
          // The launcher is handed this directory by the command that starts
          // the loop, and it reads the marker where the stop wrote it.
          const launcher = launcherOf({
            label,
            description: "amy, driving fixture",
            program: process.execPath,
            args: [],
            env: {},
            workingDirectory: machine.home,
            log: path.join(machine.home, "daemon.log"),
            directory,
          });
          expect(launcher).toContain(path.join(directory, `${label}.stopped`));
          expect(calls.some(([command]) => command === "schtasks")).toBe(true);
        }),
        { numRuns: 30 },
      );
    } finally {
      process.chdir(previous);
      fs.rmSync(base, { recursive: true, force: true });
    }
  }, 60_000);
});
