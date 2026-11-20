import { WorkRecord } from "./work.js";

/** One origin of new work, and the levels its rounds are counted at. */
export interface OriginRules {
  /** The level whose number of rounds applies below `findingsAt`. */
  readonly level: string;
  /** The level that applies at or above `findingsAt`; absent means `level` for every count. */
  readonly beyond?: string;
  /** How much a round must find for `beyond` to apply; absent means it never does. */
  readonly findingsAt?: number;
}

/**
 * Every number an escalation rests on, named in the workflow's `config.yaml`.
 *
 * `scale` holds a level per name, and a level is the number of rounds that
 * level allows before the work climbs one rung. `origins` says which level
 * each kind of new work is counted at, and `rungs` is how long the ladder is:
 * its last rung is a person, so work that runs out one rung below it is
 * escalated rather than asked of a stronger model again.
 */
export interface EscalationRules {
  readonly scale: Readonly<Record<string, number>>;
  readonly origins: Readonly<Record<string, OriginRules>>;
  readonly rungs: number;
}

/** One origin's standing: what its rounds have earned, and whether the ladder is spent. */
export interface Climb {
  readonly origin: string;
  readonly level: string;
  /** The rounds this level allows before the next rung. */
  readonly needed: number;
  readonly rounds: number;
  /** The rung the work starts on, counted from the first. */
  readonly rung: number;
  /** True when even the last rung before a person has been spent. */
  readonly exhausted: boolean;
}

/** What one origin's rules and findings say the level is, and how many rounds it allows. */
export function levelFor(
  rules: EscalationRules,
  origin: string,
  findings: number,
): { readonly level: string; readonly needed: number } {
  const forOrigin = rules.origins[origin];
  if (!forOrigin) {
    throw new Error(`nothing says how \`${origin}\` escalates: name it under escalation.origins`);
  }
  const beyond = forOrigin.beyond;
  const at = forOrigin.findingsAt;
  const level = beyond !== undefined && at !== undefined && findings >= at ? beyond : forOrigin.level;
  const needed = rules.scale[level];
  if (needed === undefined) {
    throw new Error(`\`${origin}\` escalates at \`${level}\`, and escalation.scale names no such level`);
  }
  if (!Number.isInteger(needed) || needed < 1) {
    throw new Error(`escalation.scale.${level} must be a whole number of rounds, one or more`);
  }
  return { level, needed };
}

/**
 * Where one origin's rounds put its work, given the rung it already reached.
 *
 * The rung only ever moves up. A round that finds less than the last one did
 * can put the level back to the patient one, and reading that as "come down a
 * rung" would hand the same work to the weaker model twice.
 */
export function climbOf(
  rules: EscalationRules,
  origin: string,
  rounds: number,
  findings: number,
  climbed = 0,
): Climb {
  const { level, needed } = levelFor(rules, origin, findings);
  const rung = Math.max(climbed, Math.floor(rounds / needed));
  return { origin, level, needed, rounds, rung, exhausted: rung >= rules.rungs - 1 };
}

/** One origin's standing, read from what the record remembers about it. */
export function climbFor(
  rules: EscalationRules,
  record: WorkRecord,
  origin: string,
  findings: number,
): Climb {
  return climbOf(rules, origin, record.roundsByOrigin?.[origin] ?? 0, findings, record.climbedByOrigin?.[origin] ?? 0);
}

/**
 * The strictest standing of every origin that sent this round back.
 *
 * Two lanes meeting at one join each count their own rounds, and the work is
 * asked of the stronger rung the moment either of them has earned it.
 */
export function strictest(among: readonly Climb[]): Climb | undefined {
  return among.reduce<Climb | undefined>(
    (worst, one) => (worst === undefined || one.rung > worst.rung ? one : worst),
    undefined,
  );
}

/** The rung an ask starts on: never the last, which is the person the work escalates to. */
export function startRung(climb: Climb, rules: EscalationRules): number {
  return Math.min(climb.rung, Math.max(0, rules.rungs - 2));
}

/** A record that counted one more round against an origin, and remembers the rung it earned. */
export function counted<R extends WorkRecord>(record: R, climb: Climb): R {
  return {
    ...record,
    roundsByOrigin: { ...record.roundsByOrigin, [climb.origin]: (record.roundsByOrigin?.[climb.origin] ?? 0) + 1 },
    climbedByOrigin: { ...record.climbedByOrigin, [climb.origin]: Math.max(record.climbedByOrigin?.[climb.origin] ?? 0, climb.rung) },
  };
}
