import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type } from "arktype";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { plugin as errand } from "../../workflow-errand/src/plugin.js";
import {
  call,
  contractDocument,
  defineContract,
  defineOperation,
  fail,
  invoke,
  isCall,
  type Invocation,
  type OperationContext,
  type StreamItem,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const context: OperationContext = { port: () => undefined };
const INFO = { title: "amy", version: "1.0.0", description: "the contract" };

const greet = defineOperation({
  id: "greeting.greet",
  domain: "greeting",
  summary: "Greets somebody by name.",
  description: "Answers a greeting. Never remembers who it greeted.",
  input: z.object({ name: z.string().describe("who to greet") }),
  output: z.object({ text: z.string().describe("the greeting") }),
  errors: { "greeting.nobody": { description: "the name was empty" } },
  writes: [],
  http: { method: "post", path: "/greetings" },
  examples: [{ summary: "a name", input: { name: "Ada" }, output: { text: "hello, Ada" } }],
  async handler({ name }) {
    if (name === "") return fail("greeting.nobody", "there is nobody to greet");
    if (name === "undeclared") return fail("greeting.unknown", "a code nobody declared");
    if (name === "throws") throw new Error("the handler broke");
    if (name === "wrong") return { text: 42 } as unknown as { text: string };
    return { text: `hello, ${name}` };
  },
});

const count = defineOperation({
  id: "counting.count",
  domain: "counting",
  summary: "Counts up to a number.",
  description: "Answers with the number, doubled. Writes nothing.",
  input: type({ to: "number" }),
  output: type({ doubled: "number" }),
  writes: [],
  http: { method: "get", path: "/count" },
  examples: [{ summary: "two", input: { to: 2 }, output: { doubled: 4 } }],
  async handler({ to }) {
    return { doubled: to * 2 };
  },
});

const ticks = defineOperation({
  id: "counting.ticks",
  domain: "counting",
  summary: "Ticks, then says it is done.",
  description: "Yields one tick per step and a done event last.",
  input: z.object({ steps: z.number().describe("how many ticks") }),
  events: {
    tick: z.object({ n: z.number().describe("which tick") }),
    done: z.object({ total: z.number().describe("how many ticked") }),
  },
  writes: [],
  http: { method: "post", path: "/ticks" },
  examples: [{ summary: "two", input: { steps: 2 }, output: [{ event: "tick", data: { n: 1 } }, { event: "tick", data: { n: 2 } }, { event: "done", data: { total: 2 } }] }],
  async *handler({ steps }) {
    if (steps < 0) {
      yield { event: "tick", data: { n: "no" as unknown as number } };
      return;
    }
    for (let n = 1; n <= steps; n++) yield { event: "tick" as const, data: { n } };
    yield { event: "done" as const, data: { total: steps } };
  },
});

const contract = defineContract([greet, count, ticks]);

async function drain(outcome: Invocation): Promise<StreamItem[]> {
  if (outcome.kind !== "stream") throw new Error(`expected a stream, got ${outcome.kind}`);
  const items: StreamItem[] = [];
  for await (const item of outcome.events) items.push(item);
  return items;
}

describe("an operation declared once", () => {
  it("runs a Zod operation and an ArkType operation alike through invoke", async () => {
    expect(await invoke(contract, "greeting.greet", { name: "Ada" }, context)).toEqual({ kind: "output", output: { text: "hello, Ada" } });
    expect(await invoke(contract, "counting.count", { to: 3 }, context)).toEqual({ kind: "output", output: { doubled: 6 } });
  });

  it("puts both libraries' operations in the document, each schema in JSON Schema", () => {
    const document = contractDocument(contract, INFO) as { openapi: string; paths: Record<string, Record<string, Record<string, unknown>>> };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/greetings"]?.post?.operationId).toBe("greeting.greet");
    expect(document.paths["/count"]?.get?.operationId).toBe("counting.count");
    expect(document.paths["/count"]?.get?.parameters).toEqual([
      { name: "to", in: "query", required: true, description: "", schema: { type: "number" } },
    ]);
    expect(document.paths["/greetings"]?.post?.["x-amy-local-only"]).toBe(true);
    expect(document.paths["/greetings"]?.post?.["x-amy-writes"]).toEqual([]);
  });

  it("keeps @amykit/core free of any runtime dependency", () => {
    const manifest = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("refuses two operations with one id", () => {
    expect(() => defineContract([greet, greet])).toThrow("`greeting.greet` is declared twice");
  });

  it("refuses two operations on one path and method in the document", () => {
    const twin = defineOperation({ ...count, id: "counting.twin" });
    expect(() => contractDocument(defineContract([count, twin]), INFO)).toThrow("which another operation already took");
  });
});

describe("invoke checks both sides of the handler", () => {
  it("refuses an input its schema rejects before the handler runs, naming the operation", async () => {
    const outcome = await invoke(contract, "greeting.greet", { name: 7 }, context);
    expect(outcome.kind).toBe("refused");
    expect(outcome.kind !== "output" && outcome.kind !== "stream" && outcome.error.message).toContain("`greeting.greet` refused its input");
    expect(outcome.kind === "refused" && outcome.error.details).toEqual([{ message: expect.any(String), path: ["name"] }]);
  });

  it("refuses an output its schema rejects after the handler, naming the operation", async () => {
    const outcome = await invoke(contract, "greeting.greet", { name: "wrong" }, context);
    expect(outcome).toMatchObject({ kind: "internal", error: { code: "amy.output" } });
    expect(outcome.kind === "internal" && outcome.error.message).toContain("`greeting.greet` answered an output its schema refuses");
  });

  it("serialises an ArkType refusal, whose own issues carry cycles", async () => {
    const outcome = await invoke(contract, "counting.count", { to: "three" }, context);
    expect(outcome.kind).toBe("refused");
    expect(() => JSON.stringify(outcome)).not.toThrow();
  });

  it("answers a declared error as itself", async () => {
    expect(await invoke(contract, "greeting.greet", { name: "" }, context)).toEqual({
      kind: "error",
      error: { code: "greeting.nobody", message: "there is nobody to greet" },
    });
  });

  it("answers a code the operation never declared as internal", async () => {
    const outcome = await invoke(contract, "greeting.greet", { name: "undeclared" }, context);
    expect(outcome).toMatchObject({ kind: "internal", error: { code: "amy.internal" } });
    expect(outcome.kind === "internal" && outcome.error.message).toContain("`greeting.unknown`, which it does not declare");
  });

  it("answers a throw as internal, naming the operation", async () => {
    expect(await invoke(contract, "greeting.greet", { name: "throws" }, context)).toEqual({
      kind: "internal",
      error: { code: "amy.internal", message: "`greeting.greet` threw: the handler broke" },
    });
  });

  it("refuses an id nothing declares", async () => {
    expect(await invoke(contract, "nothing.here", {}, context)).toMatchObject({ kind: "refused", error: { code: "amy.unknown_operation" } });
  });
});

describe("a streaming operation", () => {
  it("yields its named events through invoke, in order", async () => {
    expect(await drain(await invoke(contract, "counting.ticks", { steps: 2 }, context))).toEqual([
      { kind: "event", event: "tick", data: { n: 1 } },
      { kind: "event", event: "tick", data: { n: 2 } },
      { kind: "event", event: "done", data: { total: 2 } },
    ]);
  });

  it("ends on an event its schema refuses, as internal", async () => {
    const items = await drain(await invoke(contract, "counting.ticks", { steps: -1 }, context));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "internal", error: { code: "amy.output" } });
  });

  it("puts every event's schema in the document", () => {
    const document = contractDocument(contract, INFO) as { paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, Record<string, unknown>> }> }>> };
    const stream = document.paths["/ticks"]?.post?.responses["200"]?.content["text/event-stream"];
    expect(Object.keys(stream?.["x-amy-events"] as object)).toEqual(["tick", "done"]);
    expect((stream?.["x-amy-events"] as Record<string, unknown>).tick).toMatchObject({ type: "object", properties: { n: { type: "number" } } });
  });
});

describe("invoke beside call", () => {
  it("still makes a call of the errand, with call and invoke both exported from the core", async () => {
    expect(errand.name).toBe("@amykit/workflow-errand");
    expect(isCall(call(errand))).toBe(true);
    expect((await invoke(contract, "counting.count", { to: 1 }, context)).kind).toBe("output");
  });
});
