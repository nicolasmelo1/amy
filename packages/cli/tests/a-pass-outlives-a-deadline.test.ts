import { describe, expect, it } from "vitest";
import { DeadlineExceeded } from "@amykit/core";
import type { Engine } from "@amykit/core";
import { onePass } from "../src/pass.js";

/** A tracker that stops answering on discovery, beside a queue that already holds work. */
class StalledTracker implements Engine {
  constructor(
    private readonly queue: string[],
    private readonly failure: Error,
  ) {}

  async discover(): Promise<string[]> {
    throw this.failure;
  }

  async tick(): Promise<{ kind: "moved" | "idle"; id?: string }> {
    const id = this.queue.shift();
    return id === undefined ? { kind: "idle" } : { kind: "moved", id };
  }
}

describe("a pass whose tracker runs out of time", () => {
  it("still advances the work already queued", async () => {
    const engine = new StalledTracker(["T-1"], new DeadlineExceeded("api.linear.app", 30_000));

    const pass = await onePass(engine);

    expect(pass.moved).toMatchObject({ kind: "moved", id: "T-1" });
  });

  it("says which host ran out of time and the deadline it had", async () => {
    const engine = new StalledTracker([], new DeadlineExceeded("api.linear.app", 30_000));

    const pass = await onePass(engine);

    expect(JSON.stringify(pass)).toContain("api.linear.app");
    expect(JSON.stringify(pass)).toContain("30000");
  });

  it("does not swallow a failure that is not a deadline", async () => {
    const engine = new StalledTracker(["T-1"], new TypeError("a defect of its own"));

    await expect(onePass(engine)).rejects.toThrow("a defect of its own");
  });
});
