import { describe, expect, it } from "vitest";
import { AskContext, Harness } from "@amykit/core";
import { fakeRun } from "@amykit/test-fixtures";
import { Granted, harnessConformance } from "../src/index.js";

/** A harness that hands each run what `hand` says, and remembers it the way a CLI's arguments would. */
function handing(hand: (context: AskContext) => Granted) {
  let last: Granted = "nothing";
  const harness: Harness = {
    name: "handing",
    ask: async (_prompt, _cwd, context = {}) => {
      last = hand(context);
      return { text: "done", run: fakeRun() };
    },
  };
  return () => ({ harness, granted: () => last });
}

describe("a harness's writing and read-only runs", () => {
  it("conforms when the writing run may write and the read-only one may only read", async () => {
    expect(await harnessConformance(handing((context) => (context.readOnly ? "read-only" : "write")))).toEqual([]);
  });

  it("fails a harness whose writing run is handed nothing, the way claude 0.7.1 passed no mode", async () => {
    expect(await harnessConformance(handing((context) => (context.readOnly ? "read-only" : "nothing")))).toEqual([
      "a writing run is handed no way to write",
    ]);
  });

  it("fails a harness whose read-only run is handed a way to write", async () => {
    expect(await harnessConformance(handing(() => "write"))).toEqual(["a read-only run is handed a way to write"]);
  });

  it("names the run that threw rather than calling it conforming", async () => {
    const harness: Harness = { name: "missing", ask: async () => { throw new Error("no CLI"); } };
    expect(await harnessConformance(() => ({ harness, granted: () => "write" }))).toEqual([
      "a writing run threw: no CLI",
      "a read-only run threw: no CLI",
    ]);
  });
});
