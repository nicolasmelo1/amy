import { Deferred, factoryOf, isDeferred } from "./deferred.js";

/**
 * Thrown through a build whose refusal is already written down, so the
 * builds that were waiting on it fail without each repeating it.
 */
class Refused extends Error {}

interface Entry {
  readonly plugin: string;
  /** What it is, the way a refusal names it: "the `agent` port". */
  readonly what: string;
  readonly build: () => object;
  state: "pending" | "building" | "built" | "failed";
  value?: object;
  /** Where the built object goes, and what has to know it was built. */
  readonly then: ((value: object) => void)[];
}

/**
 * The deferred implementations of one mount.
 *
 * Built once every plugin has registered, each exactly once, and on demand
 * when one reads another — which is what keeps the order plugins are listed
 * in from mattering. One instance per `mount()`, so two hosts in a process
 * never share a build.
 */
export class Builds {
  private readonly entries = new Map<Deferred, Entry>();
  private readonly building: Entry[] = [];
  private open = false;

  constructor(private readonly problems: string[]) {}

  /** Records a deferred implementation, and what to do with what it builds. */
  defer(marker: Deferred, plugin: string, what: string, then: (value: object) => void): void {
    const existing = this.entries.get(marker);
    if (existing) {
      existing.then.push(then);
      return;
    }
    this.entries.set(marker, { plugin, what, build: factoryOf(marker), state: "pending", then: [then] });
  }

  /** Runs `then` with the built object, once there is one. */
  afterBuilt(marker: Deferred, then: (value: object) => void): void {
    const entry = this.entries.get(marker);
    if (!entry) return;
    if (entry.state === "built" && entry.value) then(entry.value);
    else entry.then.push(then);
  }

  /** Whether this value is one of this mount's deferred implementations. */
  holds(value: unknown): value is Deferred {
    return isDeferred(value) && this.entries.has(value);
  }

  /**
   * What a reader receives: the built object, never the factory.
   *
   * Building on demand here is what lets one deferred implementation read
   * another listed after it. Read during `register`, it is refused by name:
   * what it needs may not have registered yet.
   */
  resolve<T>(value: T): T | object {
    if (!this.holds(value)) return value;
    const entry = this.entries.get(value)!;
    if (!this.open) {
      throw new Error(
        `${entry.what} of ${entry.plugin} is built once every plugin has registered; read it when it is used, not in \`register\``,
      );
    }
    return this.get(entry);
  }

  /**
   * A collection as a reader sees it: each deferred member built when it is
   * read, never the factory. Lazily, member by member, so a member that reads
   * a sibling while it builds is not mistaken for one that reads itself.
   */
  collection(members: Map<string, object> | undefined): ReadonlyMap<string, object> {
    return new BuiltCollection(members ?? new Map(), this);
  }

  /** Builds every deferred implementation, in the order it was registered. */
  buildAll(): void {
    this.open = true;
    for (const entry of this.entries.values()) {
      try {
        this.get(entry);
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
      }
    }
  }

  private get(entry: Entry): object {
    if (entry.state === "built") return entry.value!;
    if (entry.state === "failed") throw new Refused(`${entry.what} of ${entry.plugin} could not be built`);
    if (entry.state === "building") this.refuseCycle(entry);

    entry.state = "building";
    this.building.push(entry);
    try {
      const value = built(entry.build());
      entry.value = value;
      entry.state = "built";
      for (const then of entry.then) then(value);
      return value;
    } catch (error) {
      entry.state = "failed";
      // A build that failed because something it read was refused is not a
      // second problem; the first one already names who to fix.
      if (!(error instanceof Refused)) {
        this.problems.push(`${entry.plugin}: failed to mount — ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new Refused(`${entry.what} of ${entry.plugin} could not be built`);
    } finally {
      this.building.pop();
    }
  }

  /** Two (or more) builds that each read the other can never finish. */
  private refuseCycle(entry: Entry): never {
    const circle = this.building.slice(this.building.indexOf(entry));
    const named = circle.map((each) => `${each.plugin} (${each.what})`);
    this.problems.push(
      circle.length === 1
        ? `${named[0]}: reads itself while it is being built`
        : named.length === 2
          ? `${named[0]} and ${named[1]} each need what the other builds, so neither can be built`
          : `${named.slice(0, -1).join(", ")} and ${named.at(-1)} need what each other builds, in a circle, so none of them can be built`,
    );
    throw new Refused(`${entry.what} of ${entry.plugin} is part of a circle`);
  }
}

/** What a build may return: an implementation, and not the promise of one. */
function built(value: unknown): object {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new Error("its deferred build returned nothing to mount");
  }
  const then = (value as { then?: unknown }).then;
  if (typeof then === "function") {
    // Handled before refusing, so a factory that rejects is this refusal and
    // not also an unhandled rejection that takes the host down.
    then.call(value, undefined, () => undefined);
    throw new Error("its deferred build returned a promise; a build returns the implementation itself");
  }
  return value;
}

/** A live view of one collection that builds each member as it is read. */
class BuiltCollection implements ReadonlyMap<string, object> {
  constructor(
    private readonly members: Map<string, object>,
    private readonly builds: Builds,
  ) {}

  get size(): number {
    return this.members.size;
  }

  has(name: string): boolean {
    return this.members.has(name);
  }

  get(name: string): object | undefined {
    const member = this.members.get(name);
    return member === undefined ? undefined : (this.builds.resolve(member) as object);
  }

  keys(): MapIterator<string> {
    return this.members.keys();
  }

  *entries(): MapIterator<[string, object]> {
    for (const name of [...this.members.keys()]) yield [name, this.get(name)!];
  }

  *values(): MapIterator<object> {
    for (const [, value] of this.entries()) yield value;
  }

  [Symbol.iterator](): MapIterator<[string, object]> {
    return this.entries();
  }

  forEach(each: (value: object, name: string, map: ReadonlyMap<string, object>) => void, self?: unknown): void {
    for (const [name, value] of this.entries()) each.call(self, value, name, this);
  }
}
