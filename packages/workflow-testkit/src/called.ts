import { actionsOf } from "@amykit/core";
import { Finding } from "./finding.js";
import { Walk } from "./walk.js";
import { PortCall } from "./world.js";

/** The ports whose every call names the unit: what a person or a forge reads. */
const UNIT_PORTS = new Set(["tracker", "code-host", "conversation"]);

/** The id a world's work is given when it runs as a phase another workflow calls. */
export function calledId(unit: string): string {
  return `${unit}/PHASE#1`;
}

/**
 * A port that writes down every method it is asked, then answers as the port
 * it stands in front of. A world hands its runtime these, and `said` returns
 * what they kept.
 */
export function watched<T extends object>(port: string, impl: T, into: PortCall[]): T {
  return new Proxy(impl, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function" || typeof key === "symbol") return value;
      return (...args: unknown[]) => {
        into.push({ port, method: key, args });
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/** One world walked twice: standing alone, and called under `UNIT/PHASE#1`. */
export interface CalledPair {
  readonly world: string;
  readonly unit: string;
  readonly alone: Walk;
  readonly called: Walk;
  readonly saidAlone: readonly PortCall[];
  readonly saidCalled: readonly PortCall[];
}

/**
 * What a workflow does differently called as a phase. Ids that key a run
 * rather than a unit — a checkout, an agent's context — are not compared:
 * each record keeps its own.
 */
export function called(pairs: readonly CalledPair[]): Finding[] {
  const findings: Finding[] = [];
  for (const pair of pairs) {
    const say = (said: string): void => {
      findings.push({ property: "called", message: `${pair.world}: called as \`${calledId(pair.unit)}\`, ${said}` });
    };
    const said = differs(pair.saidAlone.filter(atUnit), pair.saidCalled.filter(atUnit));
    if (said) say(said.called === undefined || said.alone === undefined ? asked(said) : named(said, pair.unit));
    const planned = firstDifference(writes(pair.alone), writes(pair.called));
    if (planned) say(`it plans ${planned.called ?? "nothing more"} where standing alone it planned ${planned.alone ?? "nothing more"}`);
    const ends = [endOf(pair.alone), endOf(pair.called)];
    if (ends[0] !== ends[1]) say(`it comes to rest in \`${ends[1] ?? "nothing"}\`, where standing alone it rests in \`${ends[0] ?? "nothing"}\``);
  }
  return findings;
}

const atUnit = (call: PortCall): boolean => UNIT_PORTS.has(call.port);

interface Differing {
  readonly alone?: PortCall;
  readonly called?: PortCall;
}

function differs(alone: readonly PortCall[], called: readonly PortCall[]): Differing | undefined {
  for (let at = 0; at < Math.max(alone.length, called.length); at += 1) {
    const one = alone[at];
    const other = called[at];
    if (spelt(one) !== spelt(other)) return { ...(one ? { alone: one } : {}), ...(other ? { called: other } : {}) };
  }
  return undefined;
}

function named(said: Differing, unit: string): string {
  const call = spelt(said.called);
  const opened = said.called!.port === "conversation" ? "opens a different conversation" : `names a different unit to the ${said.called!.port}`;
  const why = call.includes(calledId(unit)) ? "the call it runs under" : "something else";
  return `it ${opened}: it asks ${call}, naming ${why}, where standing alone it asked ${spelt(said.alone)}`;
}

function asked(said: Differing): string {
  return said.called
    ? `it asks ${spelt(said.called)}, which standing alone it never asked`
    : `it never asks ${spelt(said.alone)}, which standing alone it asked`;
}

function spelt(call: PortCall | undefined): string {
  if (!call) return "";
  return `\`${call.port}.${call.method}(${call.args.map((arg) => safely(arg)).join(", ")})\``;
}

function safely(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The actions every look planned, in order: what the work did to the world. */
function writes(walk: Walk): string[] {
  return walk.looks.flatMap((look) => actionsOf(look.plan).map((action) => action.type));
}

function firstDifference(alone: readonly string[], called: readonly string[]): { alone?: string; called?: string } | undefined {
  for (let at = 0; at < Math.max(alone.length, called.length); at += 1) {
    if (alone[at] !== called[at]) {
      return { ...(alone[at] ? { alone: `\`${alone[at]}\`` } : {}), ...(called[at] ? { called: `\`${called[at]}\`` } : {}) };
    }
  }
  return undefined;
}

function endOf(walk: Walk): string | undefined {
  return walk.rest?.state;
}

