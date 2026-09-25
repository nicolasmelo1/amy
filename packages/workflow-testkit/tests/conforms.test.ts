import { describe, expect, it } from "vitest";
import { ConformanceError, PROPERTIES, Runner, conforms } from "../src/index.js";
import { advance, runtimeOf, settled, workflowOf } from "./machines.js";

/** Collects what `conforms` registers, so a test can run each one and read the result. */
function recordingRunner() {
  const suites: string[] = [];
  const tests: { name: string; body: () => Promise<void> }[] = [];
  const runner: Runner = {
    describe: (name, body) => {
      suites.push(name);
      body();
    },
    it: (name, body) => {
      tests.push({ name, body });
    },
  };
  return { runner, suites, tests };
}

const received = () =>
  workflowOf({
    states: ["received", "done"],
    terminal: ["done"],
    plan: (record) => (record.state === "received" ? advance("done") : settled()),
  });

describe("conforms", () => {
  it("registers one test per property, named for what it claims", () => {
    const { runner, suites, tests } = recordingRunner();

    conforms(received(), { runner, runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [{ name: "w" }] });

    expect(suites).toEqual(["tiny conforms to the machine"]);
    expect(tests.map((test) => test.name)).toEqual(Object.values(PROPERTIES));
  });

  it("goes green for a workflow that conforms, walking the worlds once", async () => {
    const { runner, tests } = recordingRunner();
    let walked = 0;

    conforms(received(), {
      runner,
      runtime: () => {
        walked += 1;
        return runtimeOf("received", { observe: () => ({}) });
      },
      worlds: [{ name: "w" }],
    });

    for (const test of tests) await expect(test.body()).resolves.toBeUndefined();
    expect(walked).toBe(1);
  });

  it("goes red under the property that failed, with every finding in the message", async () => {
    const { runner, tests } = recordingRunner();

    conforms(received(), {
      runner,
      runtime: () => runtimeOf("received", { observe: () => ({}), actions: { page: undefined } }),
      worlds: [{ name: "w" }],
    });

    const handlers = tests.find((test) => test.name === PROPERTIES.handlers)!;
    const error = await handlers.body().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ConformanceError);
    expect((error as Error).message).toBe(
      "every action it plans has a handler that survives being called, and it did not:\n" +
        "  - action `page` is declared with no implementation — give it a handler, or a port and a method",
    );
    await expect(tests.find((test) => test.name === PROPERTIES.reachability)!.body()).resolves.toBeUndefined();
  });

  it("asks for a runner when there are no globals to use", () => {
    expect(() => conforms(received(), { runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [] })).toThrow(
      /conforms needs a test runner/,
    );
  });

  it("says so when no world was given", async () => {
    const { runner, tests } = recordingRunner();

    conforms(received(), { runner, runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [] });

    await expect(tests[0]!.body()).rejects.toThrow("no world was given, so nothing was walked");
  });
});
