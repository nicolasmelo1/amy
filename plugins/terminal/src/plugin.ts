import { CommandRunner, ConfigOf, ConfigSchema, NodeCommandRunner, OperationContext, defineOperation, definePlugin, fail, scopeOf } from "@amykit/core";
import { z } from "zod";

export const configSchema = {
  binary: { type: "string", default: "tu", description: "the terminal-use command, or a path to it" },
  session: { type: "string", default: "amy", description: "the terminal-use session every operation drives, so steps of one scenario share one program" },
  timeoutMs: { type: "number", default: 60 * 1000, description: "how long one terminal-use command may run, past any wait it was asked for" },
} satisfies ConfigSchema;

type Settings = ConfigOf<typeof configSchema>;

const FAILED = "terminal.failed";
const errors = { [FAILED]: { description: "terminal-use answered with an error, or did not answer" } };

/**
 * One terminal-use command, with `--json`: it answers JSON where it says
 * anything, and an error as `Error: <message>` on stderr with exit 1
 * (https://github.com/flipbit03/terminal-use).
 */
async function tu(runner: CommandRunner, context: OperationContext, id: string, args: readonly string[], extraMs = 0): Promise<{ ok: true; data: unknown } | { ok: false; why: string; exitCode: number | null }> {
  const { settings } = scopeOf<Settings>(context, id);
  const ran = await runner.run(settings.binary, ["--json", ...args], { timeoutMs: settings.timeoutMs + extraMs });
  if (!ran.ok) return { ok: false, exitCode: ran.exitCode, why: `\`${settings.binary} ${args.join(" ")}\` failed (exit ${ran.exitCode ?? "killed"}): ${`${ran.stderr}${ran.stdout}`.trim()}` };
  let data: unknown;
  try {
    data = ran.stdout.trim() === "" ? null : JSON.parse(ran.stdout.trim()) as unknown;
  } catch {
    data = ran.stdout;
  }
  return { ok: true, data };
}

const session = (context: OperationContext, id: string) => ["--name", scopeOf<Settings>(context, id).settings.session];

export function terminalOperations(runner: CommandRunner) {
  const run = defineOperation({
    id: "terminal.run",
    domain: "terminal",
    summary: "Run an interactive program in the session",
    description: "Runs `tu run --name <session> <command> [args...]`, in `cwd` when it says one.",
    input: z.object({
      command: z.string().min(1).describe("the program"),
      args: z.array(z.string()).default([]).describe("its arguments"),
      cwd: z.string().optional().describe("where it runs"),
      size: z.string().regex(/^\d+x\d+$/).optional().describe("the screen, as `COLSxROWS`"),
    }),
    output: z.object({ pid: z.number().optional().describe("pid") }),
    errors,
    writes: [],
    http: { method: "post", path: "/terminal/run" },
    examples: [{ summary: "an editor", input: { command: "vim", args: ["notes.md"] }, output: { pid: 4242 } }],
    async handler({ command, args, cwd, size }, context) {
      const ran = await tu(runner, context, "terminal.run", ["run", ...session(context, "terminal.run"), ...(cwd ? ["--cwd", cwd] : []), ...(size ? ["--size", size] : []), command, ...args]);
      if (!ran.ok) return fail(FAILED, ran.why);
      const pid = (ran.data as { pid?: unknown } | null)?.pid;
      return typeof pid === "number" ? { pid } : {};
    },
  });

  const type = defineOperation({
    id: "terminal.type",
    domain: "terminal",
    summary: "Type text into the program",
    description: "Runs `tu type -- <text>`: the text is typed as it is, even when it starts with `-`.",
    input: z.object({ text: z.string().describe("what to type") }),
    output: z.object({ done: z.boolean().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/terminal/type" },
    examples: [{ summary: "a line", input: { text: "hello" }, output: { done: true } }],
    async handler({ text }, context) {
      const ran = await tu(runner, context, "terminal.type", ["type", ...session(context, "terminal.type"), "--", text]);
      return ran.ok ? { done: true } : fail(FAILED, ran.why);
    },
  });

  const press = defineOperation({
    id: "terminal.press",
    domain: "terminal",
    summary: "Press keys, in order",
    description: "Runs `tu press -- <key>...`, as `Escape : w q Enter` or `Ctrl+C`.",
    input: z.object({ keys: z.array(z.string().min(1)).min(1).describe("the keys, in order") }),
    output: z.object({ done: z.boolean().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/terminal/press" },
    examples: [{ summary: "save and quit", input: { keys: ["Escape", ":", "w", "q", "Enter"] }, output: { done: true } }],
    async handler({ keys }, context) {
      const ran = await tu(runner, context, "terminal.press", ["press", ...session(context, "terminal.press"), "--", ...keys]);
      return ran.ok ? { done: true } : fail(FAILED, ran.why);
    },
  });

  const wait = defineOperation({
    id: "terminal.wait",
    domain: "terminal",
    summary: "Wait for text on the screen, or for the screen to stand still",
    description: "Runs `tu wait --text <regex>` or `tu wait --stable <ms>`, with `--timeout`. A wait that times out answers `matched: false`, not an error.",
    input: z.object({
      text: z.string().optional().describe("a regular expression the screen must show"),
      stableMs: z.number().int().positive().optional().describe("how long the screen must stay still"),
      timeoutMs: z.number().int().positive().default(5000).describe("how long to wait"),
    }),
    output: z.object({ matched: z.boolean().describe("matched") }),
    errors: { ...errors, "terminal.wait": { description: "a wait names neither text nor stillness" } },
    writes: [],
    http: { method: "post", path: "/terminal/wait" },
    examples: [{ summary: "a prompt", input: { text: "\\$ $", timeoutMs: 5000 }, output: { matched: true } }],
    async handler({ text, stableMs, timeoutMs }, context) {
      if (text === undefined && stableMs === undefined) return fail("terminal.wait", "a wait names the text to see or how long the screen stays still");
      const ran = await tu(runner, context, "terminal.wait", [
        "wait", ...session(context, "terminal.wait"),
        // Bound with `=`: a pattern starting with `-` would read as an option.
        ...(text !== undefined ? [`--text=${text}`] : [`--stable=${stableMs}`]),
        `--timeout=${timeoutMs}`,
      ], timeoutMs);
      if (ran.ok) return { matched: true };
      return /timed out/i.test(ran.why) ? { matched: false } : fail(FAILED, ran.why);
    },
  });

  const screen = defineOperation({
    id: "terminal.screen",
    domain: "terminal",
    summary: "Read the screen as text",
    description: "Runs `tu screenshot`, read as its JSON: the text on screen, its size and the cursor.",
    input: z.object({}),
    output: z.object({ content: z.string().describe("screen"), rows: z.number().describe("rows"), cols: z.number().describe("columns") }),
    errors,
    writes: [],
    http: { method: "post", path: "/terminal/screen" },
    examples: [{ summary: "a prompt", input: {}, output: { content: "$ ", rows: 24, cols: 80 } }],
    async handler(_input, context) {
      const ran = await tu(runner, context, "terminal.screen", ["screenshot", ...session(context, "terminal.screen")]);
      if (!ran.ok) return fail(FAILED, ran.why);
      const data = (ran.data ?? {}) as { content?: unknown; rows?: unknown; cols?: unknown };
      if (typeof data.content !== "string") return fail(FAILED, `\`tu screenshot\` answered no screen: ${JSON.stringify(ran.data)}`);
      return { content: data.content, rows: Number(data.rows ?? 0), cols: Number(data.cols ?? 0) };
    },
  });

  const kill = defineOperation({
    id: "terminal.kill",
    domain: "terminal",
    summary: "End the program and its session",
    description: "Runs `tu kill`.",
    input: z.object({}),
    output: z.object({ done: z.boolean().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/terminal/kill" },
    examples: [{ summary: "done", input: {}, output: { done: true } }],
    async handler(_input, context) {
      const ran = await tu(runner, context, "terminal.kill", ["kill", ...session(context, "terminal.kill")]);
      return ran.ok ? { done: true } : fail(FAILED, ran.why);
    },
  });

  return [run, type, press, wait, screen, kill];
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-terminal",
  configSchema,
  operations: terminalOperations(new NodeCommandRunner()),
  register() {},
});
