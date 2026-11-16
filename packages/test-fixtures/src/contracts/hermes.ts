import { readFileSync } from "node:fs";
import { ContractViolation, contractFile } from "./violation.js";

/**
 * The invocations amy makes of `hermes`, held to what the pinned CLI prints in
 * its own help (`contracts/hermes-cli-help.txt`, tag v2026.9.24). Hermes
 * publishes no schema, so its help is the contract, as `gh reference` is gh's.
 */
const CONTRACT = "hermes";

const help = readFileSync(contractFile("hermes-cli-help.txt"), "utf8");

/** The text between two `### …` headings of the vendored help. */
function section(heading: string): string {
  const start = help.indexOf(`### ${heading}`);
  if (start < 0) return "";
  const next = help.indexOf("### ", start + 4);
  return help.slice(start, next < 0 ? undefined : next);
}

const TOP = section("hermes --help");
const PROFILE = section("hermes profile create --help");
const CONFIG = section("hermes config --help");

/** Flags that appear in a section's help text, split from their metavariables. */
function flagsIn(sectionText: string): { allows: Set<string>; values: Set<string> } {
  const allows = new Set<string>();
  const values = new Set<string>();
  const words = sectionText.split(/\s+/);
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (!/^--?[a-z][a-z-]*$/i.test(word)) continue;
    allows.add(word);
    // `--skills SKILLS` and `-z PROMPT`: a metavariable follows the flag.
    const next = words[index + 1];
    if (next && /^[A-Z][A-Z_]*$/.test(next)) values.add(word);
  }
  return { allows, values };
}

const top = flagsIn(TOP);
const profile = flagsIn(PROFILE);
const config = flagsIn(CONFIG);

/** The global profile selector; its own help documents `hermes -p <name> …`. */
for (const flag of ["-p", "--profile"]) {
  top.allows.add(flag);
  top.values.add(flag);
}

const PROFILE_COMMANDS = new Set(["show", "create", "describe"]);
const CONFIG_COMMANDS = new Set(["get", "set"]);

function assertFlag(flag: string, allowed: Set<string>): void {
  if (!allowed.has(flag)) {
    throw new ContractViolation(CONTRACT, `the CLI's help names no ${flag} option here`);
  }
}

/** Walks flags and positionals, checking each flag and whether it takes a value. */
function walk(args: readonly string[], allowed: { allows: Set<string>; values: Set<string> }, positionals: number, what: string): void {
  let seen = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg.startsWith("-")) {
      const flag = arg.split("=")[0]!;
      assertFlag(flag, allowed.allows);
      if (allowed.values.has(flag) && !arg.includes("=")) index += 1;
    } else {
      seen += 1;
    }
  }
  if (seen !== positionals) {
    throw new ContractViolation(CONTRACT, `${what} takes ${positionals} positional argument(s), not ${seen}`);
  }
}

export function assertValidHermesInvocation(args: readonly string[]): void {
  if (args.length === 0) throw new ContractViolation(CONTRACT, "an invocation names a command");

  let at = 0;
  let scopedProfile = false;
  if (args[0] === "-p" || args[0] === "--profile") {
    if (args.length < 2) throw new ContractViolation(CONTRACT, "-p names a profile");
    scopedProfile = true;
    at = 2;
  }

  const command = args[at];
  if (command === "profile") return profileInvocation(args.slice(at + 2), args[at + 1]);
  if (command === "config") return configInvocation(args.slice(at + 2), args[at + 1], scopedProfile);

  // The one-shot: `-p P -s NAME -z PROMPT --usage-file PATH [-m MODEL]`.
  if (!args.includes("-z")) {
    throw new ContractViolation(CONTRACT, "a one-shot takes -z PROMPT");
  }
  walk(args, top, 0, "a one-shot");
}

function profileInvocation(rest: readonly string[], sub: string | undefined): void {
  if (!sub || !PROFILE_COMMANDS.has(sub)) {
    throw new ContractViolation(CONTRACT, `profile takes ${[...PROFILE_COMMANDS].join(", ")}, not ${JSON.stringify(sub)}`);
  }
  walk(rest, profile, 1, `profile ${sub}`);
}

function configInvocation(rest: readonly string[], sub: string | undefined, scopedProfile: boolean): void {
  if (!sub || !CONFIG_COMMANDS.has(sub)) {
    throw new ContractViolation(CONTRACT, `config takes ${[...CONFIG_COMMANDS].join(", ")}, not ${JSON.stringify(sub)}`);
  }
  if (!scopedProfile) throw new ContractViolation(CONTRACT, "config names the profile with -p");
  walk(rest, config, sub === "set" ? 2 : 1, `config ${sub}`);
}
