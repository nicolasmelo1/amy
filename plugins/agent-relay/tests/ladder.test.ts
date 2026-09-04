import { describe, it, expect } from "vitest";
import { AgentOutcome } from "@amy/core";
import { nextRung, Rung } from "../src/ladder.js";

/**
 * Two models on claude, then two on codex.
 *
 * Ordered harness-major on purpose: it is what makes "next model of the same
 * harness" and "next harness" the same step in different places.
 */
const LADDER: Rung[] = [
  { name: "claude:sonnet", harness: "claude", model: "sonnet" },
  { name: "claude:opus", harness: "claude", model: "opus" },
  { name: "codex:gpt-5", harness: "codex", model: "gpt-5" },
  { name: "codex:gpt-5-pro", harness: "codex", model: "gpt-5-pro" },
];

const at = (index: number | null) => (index === null ? null : LADDER[index]!.name);

describe("a failure walks both axes", () => {
  it("goes up a model tier inside the same harness first", () => {
    expect(at(nextRung(LADDER, 0, "failed"))).toBe("claude:opus");
  });

  it("moves to the next harness once that harness has no stronger model", () => {
    // The confirmed policy: a harness bug is not fixed by a bigger model
    // behind it, so failure keeps going rather than escalating to the
    // operator while an untried harness sits there.
    expect(at(nextRung(LADDER, 1, "failed"))).toBe("codex:gpt-5");
  });

  it("gives up only at the very end, which is when the workflow escalates", () => {
    expect(nextRung(LADDER, 3, "failed")).toBeNull();
  });
});

describe("a rate limit changes harness, never model", () => {
  it("skips every remaining model of the throttled harness", () => {
    // claude:opus is next in the list and is deliberately not chosen: it sits
    // behind the same quota that just refused.
    expect(at(nextRung(LADDER, 0, "rate-limited"))).toBe("codex:gpt-5");
  });

  it("has nowhere to go when the last harness is the throttled one", () => {
    expect(nextRung(LADDER, 2, "rate-limited")).toBeNull();
  });
});

describe("the outcomes that ask for nothing", () => {
  it("stops on completed, because there is nothing to escalate", () => {
    expect(nextRung(LADDER, 0, "completed")).toBeNull();
  });

  it("stops on abandoned, which is what keeps the handbrake working", () => {
    // `abandoned` means the child was killed or the binary is missing.
    // Advancing would start a fresh process at the exact moment the operator
    // ran `amy stop`, so the ladder ends here on purpose.
    expect(nextRung(LADDER, 0, "abandoned")).toBeNull();
  });
});

describe("a ladder of one, which is the single-harness install", () => {
  const solo: Rung[] = [{ name: "claude", harness: "claude", model: "" }];

  it.each<AgentOutcome>(["completed", "failed", "rate-limited", "abandoned"])(
    "never moves after %s",
    (outcome) => {
      expect(nextRung(solo, 0, outcome)).toBeNull();
    },
  );
});

it("refuses to read past the end of the ladder", () => {
  expect(nextRung(LADDER, 99, "failed")).toBeNull();
});
