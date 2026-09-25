import { WorkflowRuntime, WorkRecord } from "@amykit/core";

/**
 * One situation the machine is put in, supplied by whoever wrote the workflow.
 *
 * The kit never invents one. It drives the author's own runtime against the
 * author's own ports, because a harness that stubs the domain proves the
 * stub: a fake that ignored the argument the real port maps over once let a
 * handler hand it `undefined` and still go green.
 *
 * A world is walked once per conformance run, so one that keeps state — a
 * fake tracker that remembers the comment it was given — is built fresh for
 * each run rather than shared between them.
 */
export interface World<R extends WorkRecord = WorkRecord> {
  /** Named in every finding, so a red test says which situation broke. */
  readonly name: string;
  /**
   * The id `newRecord` is given, for a runtime that resolves it against a
   * port — a ticket id the fake tracker knows, a note the notes directory
   * holds. Left out, the world's name.
   */
  readonly workId?: string;
  /**
   * The record the walk starts from. Left out, the runtime's own `newRecord`
   * makes it, which is the only start that proves a state reachable from the
   * beginning.
   */
  readonly start?: (now: Date) => R;
  /**
   * What the outside world does while the machine waits, in order: somebody
   * answers, a reviewer reviews, a checkout frees up.
   *
   * One runs each time the machine waits, and never otherwise — so a state
   * that moves on without one of these having run moved on something that
   * was already there.
   */
  readonly meanwhile?: readonly (() => void | Promise<void>)[];
}

export interface ConformanceOptions<R extends WorkRecord, O, W extends World<R>> {
  /**
   * The workflow's own runtime, over the fake ports a world carries.
   *
   * `now` is the kit's clock. Ports that stamp anything — an answer, a gate
   * run — read it, so the record and the world agree on what happened first.
   */
  readonly runtime: (world: W, now: () => Date) => WorkflowRuntime<R, O>;
  readonly worlds: readonly W[];
  /**
   * The ports an action declared as a port and a method is called on, by
   * kind — the fakes a world carries, handed over the way the host hands
   * over the mounted ones. Left out, no port is mounted, and an action wired
   * that way is reported as having nothing behind it.
   */
  readonly ports?: (world: W) => Readonly<Record<string, object>>;
  /**
   * States where the machine has given up and handed the work to a person.
   *
   * A state entered by an `escalate` action is one already, without being
   * named here. This is for a workflow that gives up some other way.
   */
  readonly givesUp?: readonly string[];
  /** How many looks one world may take before it is called a spin. Default 200. */
  readonly maxLooks?: number;
  /**
   * How many more looks a wait is held for when the kit asks whether waiting
   * is being counted as trying. Default 10, which is past every attempt
   * ceiling either shipped workflow sets.
   */
  readonly extraLooks?: number;
  /** When the clock starts. Default a Thursday noon, UTC. */
  readonly start?: Date;
}

/** The time a walk runs at. It only moves when the kit moves it. */
export class Clock {
  private at: number;

  constructor(start: Date) {
    this.at = start.getTime();
  }

  readonly now = (): Date => new Date(this.at);

  pass(ms: number): void {
    this.at += ms;
  }
}
