import type { Operated } from "@amykit/core";
import { Fixture, fixtureSchema, meets } from "./scenario.js";

/**
 * A fixture ensures a state rather than performing an action: it reads the
 * world first, acts only on what differs, and asks a person when it cannot.
 * Shared across scenarios, so it is configured once, not written per brief.
 */
export type Ensured =
  | { readonly holds: true; /** The operations it had to call, in order; none when the state already held. */ readonly acted: readonly string[] }
  | { readonly holds: false; readonly acted: readonly string[]; /** What a person is asked to make true. */ readonly ask: string };

/** Reads the fixtures a configuration names, refusing one that is not a fixture, by name. */
export function readFixtures(raw: Readonly<Record<string, unknown>>): Record<string, Fixture> {
  const fixtures: Record<string, Fixture> = {};
  for (const [name, value] of Object.entries(raw)) {
    const read = fixtureSchema.safeParse(value);
    if (!read.success) throw new Error(`the fixture \`${name}\` is not one: ${read.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    fixtures[name] = read.data;
  }
  return fixtures;
}

export async function ensure(name: string, fixture: Fixture, operate: (id: string, input: unknown) => Promise<Operated>): Promise<Ensured> {
  const acted: string[] = [];
  for (const clause of fixture.ensure) {
    const read = await operate(clause.check.operation, clause.check.input);
    if (read.ok && meets(read.output, clause.check.expect)) continue;
    if (!clause.act) {
      return { holds: false, acted, ask: `the fixture \`${name}\` needs \`${clause.check.operation}\` to hold, and nothing configured can make it hold: make it true, then answer here` };
    }
    const done = await operate(clause.act.operation, clause.act.input);
    acted.push(clause.act.operation);
    const again = done.ok ? await operate(clause.check.operation, clause.check.input) : done;
    if (!again.ok || !meets(again.output, clause.check.expect)) {
      const why = again.ok ? "it still does not hold" : `${again.error.code}: ${again.error.message}`;
      return { holds: false, acted, ask: `the fixture \`${name}\` ran \`${clause.act.operation}\` and \`${clause.check.operation}\` ${again.ok ? "still does not hold" : `failed (${why})`}: make it true, then answer here` };
    }
  }
  return { holds: true, acted };
}
