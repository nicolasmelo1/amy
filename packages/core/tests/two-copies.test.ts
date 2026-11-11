import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import * as A from "../src/index.js";

/*
 * An install always holds more than one copy of the core: the CLI's own, the
 * plugins root's, and whatever a project's phase folder resolves from its own
 * node_modules. Whatever one copy marks a value with, another copy has to
 * read. 0.7.0 shipped two marks that were local symbols — the port need and
 * the operation failure — and a project with a `prove/` phase could not mount
 * at all. These run the core against a second copy of itself, both ways.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// Under node_modules, so its bare imports resolve and no lint, coverage or
// git ever reads it.
const copy = path.join(here, "..", "node_modules", `.second-copy-${process.pid}`);
let B: typeof A;

beforeAll(async () => {
  fs.cpSync(path.join(here, "..", "src"), path.join(copy, "src"), { recursive: true });
  B = await import(pathToFileURL(path.join(copy, "src", "index.ts")).href) as typeof A;
});

afterAll(() => {
  fs.rmSync(copy, { recursive: true, force: true });
});

const HOST: A.HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-11-10T12:00:00.000Z"),
  paths: { state: "/state" },
};

interface Forge {
  open(): number;
}

function callee(core: typeof A) {
  type Record = A.WorkRecord & { state: "OPENING" | "OPENED"; opened?: number };
  return core.withDiagram(core.defineWorkflow({
    name: "opener",
    configSchema: {},
    policy: {},
    needs: { forge: core.port<Forge>(), clock: core.optional<{ now(): Date }>() },
    output: { OPENED: (record: Record) => ({ number: record.opened ?? 0 }) },
    decide: {
      OPENING: (record: Record) => (record.opened ? core.advance("OPENED", "opened") : core.act("open it", { type: "open" })),
      OPENED: () => core.settled("opened"),
    },
    record: () => ({}),
    observe: async () => ({}),
    actions: { open: async (scope, work) => { work.outcomes.opened = (scope.ports as { forge: Forge }).forge.open(); } },
    remember: (_scope, record: Record, outcomes) => (typeof outcomes.opened === "number" ? { ...record, opened: outcomes.opened } : record),
  }), "stateDiagram-v2\n    [*] --> OPENING\n    OPENING --> OPENED\n    OPENED --> [*]\n");
}

function caller(core: typeof A, called: A.Plugin): A.Plugin {
  return core.withDiagram(core.defineWorkflow({
    name: "caller",
    configSchema: {},
    policy: {},
    needs: {},
    calls: { PR: core.call(called, { output: { OPENED: (work: A.WorkRecord, out: unknown) => ({ ...work, number: (out as { number: number }).number }) } }) },
    decide: { DONE: () => core.settled("done") },
    record: () => ({}),
    observe: async () => ({}),
    actions: {},
  }), "stateDiagram-v2\n    [*] --> PR\n    state \"open it · opener\" as PR\n    PR --> DONE: OPENED\n    DONE --> [*]\n    class PR call\n");
}

const forge: A.Plugin = { name: "forge", register: (registry) => registry.port("forge", { open: () => 42 } satisfies Forge) };

describe("the core reads what another copy of itself marked", () => {
  it("mounts a call whose callee another copy declared, ports and all", async () => {
    for (const [mounting, declaring] of [[A, () => B], [() => B, A]] as const) {
      const host = typeof mounting === "function" ? mounting() : mounting;
      const other = typeof declaring === "function" ? declaring() : declaring;
      const outcome = await host.mount([forge, caller(host, callee(other))], {}, HOST);
      expect(outcome.ok ? [] : outcome.problems).toEqual([]);
    }
  });

  it("answers a failure another copy's handler returned as that failure, not as an output", async () => {
    const asks = (core: typeof A) => core.defineOperation({
      id: "asking.ask",
      domain: "asking",
      summary: "Asks.",
      description: "Fails with a declared code.",
      input: z.object({}),
      output: z.object({ text: z.string().describe("the answer") }),
      errors: { "asking.nobody": { description: "nobody answered" } },
      writes: [],
      http: { method: "post", path: "/ask" },
      examples: [],
      async handler() {
        return core.fail("asking.nobody", "nobody answered");
      },
    });
    for (const [host, other] of [[A, () => B], [() => B, () => A]] as const) {
      const invoking = typeof host === "function" ? host() : host;
      const declaring = other();
      const answered = await invoking.invoke(invoking.defineContract([asks(declaring)]), "asking.ask", {}, { port: () => undefined });
      expect(answered).toMatchObject({ kind: "error", error: { code: "asking.nobody" } });
    }
  });
});
