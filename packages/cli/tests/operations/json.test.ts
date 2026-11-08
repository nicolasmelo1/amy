import { registerSchema, unregisterSchema, validate } from "@hyperjump/json-schema/draft-2020-12";
import { afterEach, describe, expect, it } from "vitest";
import { gather } from "../../src/plugin-commands.js";
import { register } from "../../src/operations/commands.js";
import { installContract } from "../../src/operations/contract.js";
import { CONFIG, WORK, demo, environment, loading, program, spoken } from "./support.js";

async function typed(...argv: string[]) {
  const gathered = await gather(CONFIG, [WORK], loading(demo()));
  const heard = spoken();
  const made = program().program;
  register(made, gathered.contributions, environment(heard.out));
  await made.parseAsync(["node", "amy", ...argv]);
  return { said: heard.said, errors: heard.errors, code: process.exitCode, contributions: gathered.contributions };
}

describe("an operation with --json", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("prints its output as JSON that validates against the contract's document", async () => {
    const ran = await typed("demo", "ada", "--also", "grace", "--json");
    expect(ran.code).toBe(0);
    const output = JSON.parse(ran.said.join("\n"));

    const document = installContract(ran.contributions) as { paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: Record<string, unknown> }> }> }>> };
    const schema = document.paths["/demo/greetings"]!.post!.responses["200"]!.content["application/json"]!.schema;
    const id = "https://amy.test/demo-greet-output";
    registerSchema({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema }, id);
    try {
      expect((await validate(id, output)).valid).toBe(true);
      // And the document is no rubber stamp: what the output is not, it refuses.
      expect((await validate(id, { ...output, mood: "grumpy" })).valid).toBe(false);
    } finally {
      unregisterSchema(id);
    }
  });

  it("prints a stream as JSON Lines, one event a line", async () => {
    const ran = await typed("demo-ticks", "3", "--json");
    expect(ran.code).toBe(0);
    expect(ran.said.map((line) => JSON.parse(line))).toEqual([
      { event: "tick", data: { n: 1 } },
      { event: "tick", data: { n: 2 } },
      { event: "tick", data: { n: 3 } },
    ]);
  });

  it("prints a declared error as the envelope on stderr, and exits 1", async () => {
    const ran = await typed("demo", "nobody", "--json");
    expect(ran.code).toBe(1);
    expect(ran.said).toEqual([]);
    expect(ran.errors.map((line) => JSON.parse(line))).toEqual([{ code: "demo.nobody", message: "there is nobody to greet" }]);
  });

  it("ends a stream that failed with the envelope on stderr, after the events it yielded, and exits 1", async () => {
    const ran = await typed("demo-ticks", "3", "--fail-at", "2", "--json");
    expect(ran.code).toBe(1);
    expect(ran.said.map((line) => JSON.parse(line))).toEqual([{ event: "tick", data: { n: 1 } }]);
    expect(JSON.parse(ran.errors[0]!)).toEqual({ code: "demo.broke", message: "broke at 2" });
  });
});
