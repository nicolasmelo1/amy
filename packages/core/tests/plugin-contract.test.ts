import { expect, it } from "vitest";
import type { Plugin, Workflow } from "../src/plugin.js";

it("rejects the removed declarations at typecheck", () => {
  const plugin: Plugin = {
    name: "example",
    // @ts-expect-error versions belong to package manifests
    version: "1.0.0",
    register() {},
  };
  const workflow: Workflow = {
    name: "example",
    states: ["done"],
    waitingStates: [],
    initialState: "done",
    terminalStates: ["done"],
    // @ts-expect-error the unused observer declaration was removed
    usesObservers: [],
    plan: () => ({ kind: "settled", why: "done" }),
  };
  expect(plugin.name).toBe(workflow.name);
});
