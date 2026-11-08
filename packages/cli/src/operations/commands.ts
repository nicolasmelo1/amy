import { Command, CommanderError } from "commander";
import type { Operation, OperationContext, PortKind } from "@amykit/core";
import { CommandEnvironment, Contribution, forProfile, namedProfile, settingsFor, stateDirectory } from "../plugin-commands.js";
import type { Profile } from "../profiles.js";
import { EXIT, answer, refuse } from "./answer.js";
import { assembleInput, declareInput, spelledAs } from "./argv.js";
import { mayColor } from "./draw.js";

/**
 * The command line a machine's plugins bring, drawn from their operations:
 * each operation with `cli` words a command, marked with its package, its
 * summary the help.
 *
 * A command the machine never mounted does not exist, and it is nobody's
 * before that: what a machine can do is what it mounted, which is the
 * difference between a framework and a program with plugins attached.
 */
export function register(program: Command, contributions: readonly Contribution[], env: CommandEnvironment): void {
  const names = namesOf(contributions);
  for (const contribution of contributions) {
    const groups = new Map<string, Command>();
    for (const operation of contribution.operations) {
      if (!operation.cli || operation.cli.words.length === 0) continue;
      const words = operation.cli.words;
      let parent = program;
      for (let depth = 1; depth < words.length; depth += 1) parent = groupAt(parent, groups, words.slice(0, depth));
      declare(parent, operation, contribution, env, names);
    }
    for (const [path, group] of groups) group.description(`${groupSummary(contribution, path)} (from ${contribution.owner})`);
  }
}

/** The command a group of words is, made the first time an operation is spelled under it. */
function groupAt(parent: Command, groups: Map<string, Command>, words: readonly string[]): Command {
  const path = words.join(" ");
  const held = groups.get(path);
  if (held) return held;
  const group = parent.command(words[words.length - 1]!);
  groups.set(path, group);
  return group;
}

/** What a group says in the help: its default operation's summary, or the operations under it. */
function groupSummary(contribution: Contribution, path: string): string {
  const under = contribution.operations.filter((operation) => operation.cli && operation.cli.words.slice(0, -1).join(" ") === path);
  const chosen = under.find((operation) => operation.cli?.default);
  if (chosen) return chosen.summary;
  return `${under.map((operation) => operation.cli!.words[operation.cli!.words.length - 1]).join(", ")}`;
}

/**
 * What the config named each package by, and what its module answered: the
 * settings a profile carries land on the name the mount reads the plugin by.
 */
function namesOf(contributions: readonly Contribution[]): ReadonlyMap<string, string> {
  return new Map(contributions.map((one) => [one.spec, one.owner]));
}

function declare(parent: Command, operation: Operation, contribution: Contribution, env: CommandEnvironment, names: ReadonlyMap<string, string>): void {
  const words = operation.cli!.words;
  const command = parent
    .command(words[words.length - 1]!, operation.cli!.default ? { isDefault: true } : undefined)
    .description(`${operation.summary} (from ${contribution.owner})`);
  declareInput(command, operation);
  command.option("--json", "print the output as JSON, a stream as JSON Lines, and an error as the envelope on stderr");
  // An argument commander itself refuses — one missing, one too many, a flag
  // nobody declared — is an input refused: said here, as the envelope under
  // --json, and exits as one. Commander's own line is not printed beside it.
  command.configureOutput({ outputError: () => {} });
  command.exitOverride((error) => {
    if (error.code === "commander.helpDisplayed" || error.code === "commander.help" || error.code === "commander.version") throw error;
    const message = error.message.replace(/^error: /, "");
    refuse({ code: "amy.input", message }, EXIT.refused, { json: askedForJson(command) }, env.out);
    throw new CommanderError(EXIT.refused, ANSWERED, message);
  });
  command.action(async (...passed: unknown[]) => {
    const invoked = passed[passed.length - 1] as Command;
    const { json, ...options } = invoked.opts<Record<string, unknown>>();
    process.exitCode = await run(contribution, operation.id, { args: invoked.processedArgs, options }, json === true, env, names);
  });
}

/** The code of an error already said to the person: the entry point exits with it and says nothing more. */
export const ANSWERED = "amy.answered";

/** Whether the command line that reached this command asked for --json, read before commander could parse it. */
function askedForJson(command: Command): boolean {
  let root = command;
  while (root.parent) root = root.parent;
  return ((root as unknown as { rawArgs?: readonly string[] }).rawArgs ?? []).includes("--json");
}

/** What was typed at one operation's command. */
interface Typed {
  readonly args: readonly unknown[];
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * Runs one operation from argv under the profile it belongs to, writing its
 * answer, and returns the exit code.
 */
async function run(contribution: Contribution, id: string, typed: Typed, json: boolean, env: CommandEnvironment, names: ReadonlyMap<string, string>): Promise<number> {
  const manner = { json, color: !json && mayColor(process.stdout) };
  const chosen = env.profileFor(contribution);
  if (!chosen.ok) return refuse({ code: "amy.input", message: chosen.problem }, EXIT.refused, manner, env.out);

  const operation = ownOperation(contribution, chosen.profile, id);
  if (!operation) {
    return refuse({ code: "amy.unknown_operation", message: `\`${id}\` is not declared by the ${contribution.owner} that ${chosen.profile.name} mounts` }, EXIT.refused, manner, env.out);
  }

  const input = assembleInput(operation, typed.args, typed.options);
  if (!input.ok) {
    return refuse({ code: "amy.input", message: `${spelledAs(operation, input.field)} ${input.why}`, details: [{ path: [input.field], message: input.why }] }, EXIT.refused, manner, env.out);
  }

  const context = await contextFor(contribution, operation, chosen.profile, env, names);
  if (!context.ok) return refuse(context.error, EXIT.internal, manner, env.out);
  return answer(operation, input.input, context.context, manner, env.out);
}

/** The operation the chosen profile's own implementation declares under this id. */
function ownOperation(contribution: Contribution, profile: Profile, id: string): Operation | undefined {
  return forProfile(contribution, profile).operations.find((operation) => operation.id === id);
}

type Prepared =
  | { ok: true; context: OperationContext }
  | { ok: false; error: { code: string; message: string } };

/**
 * What the operation is handed: the profile's directory, the machine root and
 * its plugin's settings, and the mounted ports for one declaring `mount: true`
 * — or the reason the machine did not come up. Never half a machine: an
 * operation that needs the ports and has half of them would report something
 * other than why it is broken.
 */
async function contextFor(
  contribution: Contribution,
  operation: Operation,
  profile: Profile,
  env: CommandEnvironment,
  names: ReadonlyMap<string, string>,
): Promise<Prepared> {
  const own = forProfile(contribution, profile);
  let settings: Record<string, unknown>;
  try {
    settings = settingsFor(own, profile, env.home, env.config, names);
  } catch (error) {
    return { ok: false, error: { code: "amy.internal", message: error instanceof Error ? error.message : String(error) } };
  }

  let ports: ReadonlyMap<PortKind, object> | undefined;
  if (operation.mount) {
    const outcome = await env.mount(profile);
    if (!outcome.ok) {
      return {
        ok: false,
        error: {
          code: "amy.unmounted",
          message: `\`amy ${operation.cli?.words.join(" ") ?? operation.id}\` needs the machine ${profile.name} drives, which did not come up: ${outcome.problems.join("; ")}`,
        },
      };
    }
    ports = outcome.ports;
  }

  return {
    ok: true,
    context: {
      port: (name) => {
        if (!ports) throw new Error(`\`${operation.id}\` does not declare mount: true, so it is handed no port; asked for \`${name}\``);
        return ports.get(name);
      },
      plugin: { state: stateDirectory(env.home, profile), home: env.home, settings },
    },
  };
}

/**
 * Runs one operation by id for a caller that is not a person — the host
 * keeping the price table current — answering its exit code. Whatever it
 * says is drawn the way a command's would be.
 */
export async function runById(
  contributions: readonly Contribution[],
  id: string,
  input: Record<string, unknown>,
  env: CommandEnvironment,
  /** Named by a caller that is not a person, so nothing can be ambiguous. */
  profileName?: string,
): Promise<number | undefined> {
  const contribution = contributions.find((one) => one.operations.some((operation) => operation.id === id));
  if (!contribution) return undefined;
  const chosen = profileName ? namedProfile(contribution, profileName) : env.profileFor(contribution);
  const manner = { json: false, color: false };
  if (!chosen.ok) return refuse({ code: "amy.input", message: chosen.problem }, EXIT.refused, manner, env.out);
  const operation = ownOperation(contribution, chosen.profile, id);
  if (!operation) return undefined;
  const context = await contextFor(contribution, operation, chosen.profile, env, namesOf(contributions));
  if (!context.ok) return refuse(context.error, EXIT.internal, manner, env.out);
  return answer(operation, input, context.context, manner, env.out);
}
