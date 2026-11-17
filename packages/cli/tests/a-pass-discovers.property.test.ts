import fs from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Engine } from "@amykit/core";
import { onePass } from "../src/pass.js";

const FALSIFIER = "a_pass_that_skips_discover";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/**
 * The mutation the property must reject: the pass `amy run` made, ticking a
 * queue nobody had just looked at.
 */
const pass = planted
  ? async (engine: Engine) => ({ found: [] as readonly string[], moved: await engine.tick() })
  : onePass;

/** A queue and a world: discovery adds what the world holds, a tick claims one. */
class FakeEngine implements Engine {
  private readonly queue: string[];

  constructor(
    private readonly world: readonly string[],
    queued: readonly string[],
  ) {
    this.queue = [...queued];
  }

  async discover(): Promise<string[]> {
    const added = this.world.filter((id) => !this.queue.includes(id));
    this.queue.push(...added);
    return added;
  }

  async tick(): Promise<{ kind: "moved" | "idle"; id?: string }> {
    const id = this.queue.shift();
    return id === undefined ? { kind: "idle" } : { kind: "moved", id };
  }
}

const ticket = fc.constantFrom("T-1", "T-2", "T-3", "T-4", "T-5");

describe("one pass", () => {
  it("a_pass_that_skips_discover", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(ticket, { maxLength: 4 }),
        fc.uniqueArray(ticket, { maxLength: 4 }),
        async (world, queued) => {
          const engine = new FakeEngine(world, queued);
          const result = await pass(engine);

          // Every ticket the world held is claimed by this pass, discovered
          // first: an empty queue beside a found ticket is the defect.
          expect([...result.found].sort()).toEqual([...world.filter((id) => !queued.includes(id))].sort());
          if (world.length + queued.length > 0) {
            expect(result.moved).toMatchObject({ kind: "moved" });
            expect([...world, ...queued]).toContain((result.moved as { id: string }).id);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("every command that looks at the world uses the same pass", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "packages/cli/src/index.ts"), "utf-8");
    // `amy run`, `amy tick` and the daemon loop: three looks, one function.
    expect(source.match(/await onePass\(engine\)/g)).toHaveLength(3);
    // And none of them calls `discover` or `tick` on its own.
    expect(source.match(/engine\.tick\(\)/g)).toBeNull();
  });
});
