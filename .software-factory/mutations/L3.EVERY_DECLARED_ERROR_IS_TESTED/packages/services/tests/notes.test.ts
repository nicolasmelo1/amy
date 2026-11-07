import type { OperationContext } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { services } from "../src/index.js";
import { invoke } from "./support/invoke.js";

const contract = services;
const store = new Map([["n1", { id: "n1", state: "OPEN", text: "buy milk" }]]);
const context: OperationContext = { port: () => ({ load: (id: string) => store.get(id) ?? null, save: () => undefined, all: () => [] }) };

describe("the notes domain", () => {
  it("reads a note the store holds", async () => {
    expect(await invoke(contract, "notes.read-note", { id: "n1" }, context)).toEqual({ kind: "output", output: { id: "n1", text: "buy milk" } });
  });

});
