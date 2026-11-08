import { afterEach, describe, expect, it } from "vitest";
import { gather } from "../../src/plugin-commands.js";
import { register } from "../../src/operations/commands.js";
import { CONFIG, WORK, demo, environment, loading, program, spoken } from "./support.js";

/** Runs `amy demo …` with --json, answering what it printed and its exit code. */
async function typed(...argv: string[]): Promise<{ output: unknown; errors: string[]; code: unknown }> {
  const gathered = await gather(CONFIG, [WORK], loading(demo()));
  const heard = spoken();
  const made = program().program;
  register(made, gathered.contributions, environment(heard.out));
  try {
    await made.parseAsync(["node", "amy", "demo", ...argv, "--json"]);
  } catch (error) {
    return { output: undefined, errors: [...heard.errors, (error as Error).message], code: (error as { exitCode?: number }).exitCode };
  }
  return { output: heard.said.length > 0 ? JSON.parse(heard.said.join("\n")) : undefined, errors: heard.errors, code: process.exitCode };
}

describe("an operation's input, from argv", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("parses a number, a bare boolean, a repeated array and an enum as their schemas say", async () => {
    const ran = await typed("ada", "--times", "3", "--loud", "--also", "grace", "--also", "alan", "--mood", "dry");
    expect(ran.code).toBe(0);
    expect(ran.output).toEqual({
      text: "HELLO ADA",
      mood: "dry",
      heard: [{ who: "ada", times: 3 }, { who: "grace", times: 3 }, { who: "alan", times: 3 }],
    });
  });

  it("refuses a value its field's type refuses with exit 2, naming the flag", async () => {
    const number = await typed("ada", "--times", "three");
    expect(number.code).toBe(2);
    expect(JSON.parse(number.errors[0]!)).toMatchObject({ code: "amy.input", message: "--times takes a number, and `three` is not one" });

    const whole = await typed("ada", "--times", "1.5");
    expect(whole.code).toBe(2);
    expect(JSON.parse(whole.errors[0]!).message).toContain("--times takes a whole number");

    const mood = await typed("ada", "--mood", "grumpy");
    expect(mood.code).toBe(2);
    expect(JSON.parse(mood.errors[0]!).message).toBe("--mood is one of warm, dry, and `grumpy` is not");
  });

  it("refuses an input the schema itself refuses with exit 2, naming the flag", async () => {
    const zero = await typed("ada", "--times", "0");
    expect(zero.code).toBe(2);
    const refused = JSON.parse(zero.errors[0]!);
    expect(refused.code).toBe("amy.input");
    expect(refused.message).toMatch(/^`amy demo` refused its input: --times: /);
  });

  it("refuses a flag nobody declared with exit 2", async () => {
    const unknown = await typed("ada", "--nonsense");
    expect(unknown.code).toBe(2);
    expect(unknown.errors.join("\n")).toContain("--nonsense");
  });

  it("lists an enum's values and a field's default in the help", async () => {
    const gathered = await gather(CONFIG, [WORK], loading(demo()));
    const made = program();
    register(made.program, gathered.contributions, environment(spoken().out));
    await expect(made.program.parseAsync(["node", "amy", "demo", "--help"])).rejects.toThrow();
    const help = made.help.join("").replace(/\s+/g, " ");
    expect(help).toContain("--mood <value> how it is said (one of: warm, dry; default: \"warm\")");
    expect(help).toContain("--also <value> who else (repeat it for more than one; default: [])");
    expect(help).toContain("--loud shout it");
    expect(help).toContain("--times <number> how many times");
  });
});
