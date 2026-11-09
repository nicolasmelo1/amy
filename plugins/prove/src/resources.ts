import type { Commands } from "@amykit/core";

/**
 * A resource a scenario runs against. Nothing about an environment is
 * assumed — containers, a Rails or a Clojure app, an account somebody lent:
 * a resource is the commands its person configured to bring it up, check it
 * and take it down, run through the commands port by the names its config
 * allows. The proving plugin names no tool.
 */
export interface Resource {
  /** How many runs may hold it at once. */
  readonly capacity: number;
  /** The command that brings it up; none for a resource that is always there. */
  readonly up?: string;
  /** The command that says it is ready. Required: a resource nothing checks is assumed, not proven. */
  readonly check: string;
  /** The command that takes it down after the run. */
  readonly down?: string;
}

/** Reads the resources a configuration names, refusing at mount one that cannot be checked, naming it. */
export function readResources(raw: Readonly<Record<string, unknown>>): Record<string, Resource> {
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, readResource(name, value)]));
}

function readResource(name: string, value: unknown): Resource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`the resource \`${name}\` is not a mapping of capacity, up, check and down`);
  const { capacity = 1, up, check, down, ...rest } = value as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) throw new Error(`the resource \`${name}\` names ${extra.map((key) => `\`${key}\``).join(", ")}, which a resource does not have: capacity, up, check and down`);
  if (typeof check !== "string" || check.trim() === "") {
    throw new Error(`the resource \`${name}\` names no \`check\` command: a resource nothing checks is assumed, not proven`);
  }
  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1) throw new Error(`the resource \`${name}\` has a capacity of ${JSON.stringify(capacity)}; it needs a whole number of seats, at least one`);
  return { capacity, check, ...command(name, "up", up), ...command(name, "down", down) };
}

/** An optional command of a resource, refused when it is there and names nothing. */
function command(name: string, key: "up" | "down", value: unknown): Partial<Pick<Resource, "up" | "down">> {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.trim() === "") throw new Error(`the resource \`${name}\` has a \`${key}\` that names no command`);
  return { [key]: value };
}

/** Every command the resources name, for a refusal when the commands port does not allow one. */
export function commandsNamed(resources: Readonly<Record<string, Resource>>): { readonly resource: string; readonly command: string }[] {
  return Object.entries(resources).flatMap(([resource, one]) => [one.up, one.check, one.down].filter((command): command is string => command !== undefined).map((command) => ({ resource, command })));
}

/** Brings a resource up and checks it; the check's output names why when it is not ready. */
export async function bringUp(name: string, resource: Resource, commands: Commands): Promise<{ readonly ok: true } | { readonly ok: false; readonly why: string; /** Whether its `up` ran, so the end of the run takes it down. */ readonly started: boolean }> {
  if (resource.up) {
    const up = await commands.run(resource.up);
    if (!up.ok) return { ok: false, started: true, why: `the resource \`${name}\` did not come up: \`${resource.up}\` exited ${up.exitCode ?? "killed"}\n${up.output}` };
  }
  const checked = await commands.run(resource.check);
  if (!checked.ok) return { ok: false, started: resource.up !== undefined, why: `the resource \`${name}\` failed its check \`${resource.check}\` (exit ${checked.exitCode ?? "killed"}):\n${checked.output}` };
  return { ok: true };
}

/** Takes a resource down; a failure is said, never thrown, because the run already ended. */
export async function takeDown(name: string, resource: Resource, commands: Commands): Promise<string | undefined> {
  if (!resource.down) return undefined;
  const down = await commands.run(resource.down);
  return down.ok ? undefined : `the resource \`${name}\` did not come down: \`${resource.down}\` exited ${down.exitCode ?? "killed"}\n${down.output}`;
}
