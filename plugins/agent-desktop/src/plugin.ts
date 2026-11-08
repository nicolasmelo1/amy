import { CommandRunner, ConfigOf, ConfigSchema, NodeCommandRunner, OperationContext, defineOperation, definePlugin, fail, scopeOf } from "@amykit/core";
import { z } from "zod";

export const configSchema = {
  binary: { type: "string", default: "agent-desktop", description: "the agent-desktop command, or a path to it" },
  timeoutMs: { type: "number", default: 60 * 1000, description: "how long one agent-desktop command may run" },
} satisfies ConfigSchema;

type Settings = ConfigOf<typeof configSchema>;

const FAILED = "desktop.failed";
const errors = { [FAILED]: { description: "agent-desktop answered with an error, or did not answer" } };

/**
 * One agent-desktop command. It always answers one JSON line,
 * `{ version, ok, command, data | error }`, and exits 1 on a structured
 * error and 2 on arguments it refused (https://agent-browser.dev/desktop/json-output).
 */
async function desktop(runner: CommandRunner, context: OperationContext, id: string, args: readonly string[]): Promise<{ ok: true; data: unknown } | { ok: false; why: string }> {
  const { settings } = scopeOf<Settings>(context, id);
  const ran = await runner.run(settings.binary, args, { timeoutMs: settings.timeoutMs });
  let envelope: { ok?: unknown; data?: unknown; error?: { code?: string; message?: string; suggestion?: string } } | undefined;
  try {
    envelope = JSON.parse(ran.stdout.trim().split("\n").at(-1) ?? "") as typeof envelope;
  } catch {
    envelope = undefined;
  }
  if (!ran.ok || envelope?.ok !== true) {
    const error = envelope?.error;
    const said = error ? `${error.code ?? "error"}: ${error.message ?? ""}${error.suggestion ? ` (${error.suggestion})` : ""}` : `${ran.stderr}${ran.stdout}`.trim();
    return { ok: false, why: `\`${settings.binary} ${args.join(" ")}\` failed (exit ${ran.exitCode ?? "killed"}): ${said}` };
  }
  return { ok: true, data: envelope.data ?? null };
}

/** A ref as agent-desktop takes it: qualified by its snapshot, `@<snapshot>:eN`. */
const ref = z.string().regex(/^@[^:\s]+:e\d+$/, "a ref is qualified by its snapshot, `@<snapshot_id>:eN`").describe("the ref a snapshot named");

export function desktopOperations(runner: CommandRunner) {
  const snapshot = defineOperation({
    id: "desktop.snapshot",
    domain: "desktop",
    summary: "Read a desktop app's accessibility tree, with refs to act on",
    description: "Runs `agent-desktop snapshot`, of the named app or the focused one; `interactive` keeps only what one can act on.",
    input: z.object({
      app: z.string().optional().describe("the app, as `agent-desktop list-apps` names it; the focused one when unsaid"),
      interactive: z.boolean().default(false).describe("keep only interactive elements"),
    }),
    output: z.object({ snapshot: z.string().describe("snapshot"), app: z.string().optional().describe("app"), tree: z.unknown().describe("tree") }),
    errors,
    writes: [],
    http: { method: "post", path: "/desktop/snapshot" },
    examples: [{ summary: "the calculator", input: { app: "Calculator", interactive: true }, output: { snapshot: "s1", app: "Calculator", tree: { role: "window", children: [] } } }],
    async handler({ app, interactive }, context) {
      const ran = await desktop(runner, context, "desktop.snapshot", ["snapshot", ...(app ? ["--app", app] : []), ...(interactive ? ["-i"] : [])]);
      if (!ran.ok) return fail(FAILED, ran.why);
      const data = (ran.data ?? {}) as { snapshot_id?: unknown; app?: unknown; tree?: unknown };
      return { snapshot: String(data.snapshot_id ?? ""), ...(typeof data.app === "string" ? { app: data.app } : {}), tree: data.tree ?? null };
    },
  });

  const click = defineOperation({
    id: "desktop.click",
    domain: "desktop",
    summary: "Click the element a snapshot ref names",
    description: "Runs `agent-desktop click <ref>`. An `ok` answer says it was delivered, not that the app did what was meant: read a snapshot after it.",
    input: z.object({ ref }),
    output: z.object({ done: z.string().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/desktop/click" },
    examples: [{ summary: "press equals", input: { ref: "@s1:e3" }, output: { done: "click @s1:e3" } }],
    async handler(input, context) {
      const ran = await desktop(runner, context, "desktop.click", ["click", input.ref]);
      return ran.ok ? { done: `click ${input.ref}` } : fail(FAILED, ran.why);
    },
  });

  const type = defineOperation({
    id: "desktop.type",
    domain: "desktop",
    summary: "Type text into the element a snapshot ref names",
    description: "Runs `agent-desktop type <ref> <text>`.",
    input: z.object({ ref, text: z.string().describe("what to type") }),
    output: z.object({ done: z.string().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/desktop/type" },
    examples: [{ summary: "a sum", input: { ref: "@s1:e2", text: "2+2" }, output: { done: "type @s1:e2" } }],
    async handler(input, context) {
      const ran = await desktop(runner, context, "desktop.type", ["type", input.ref, input.text]);
      return ran.ok ? { done: `type ${input.ref}` } : fail(FAILED, ran.why);
    },
  });

  const press = defineOperation({
    id: "desktop.press",
    domain: "desktop",
    summary: "Press a key combination",
    description: "Runs `agent-desktop press <combo>`, as `ctrl+shift+z`, in the named app or the focused one.",
    input: z.object({ combo: z.string().min(1).describe("the keys, as `ctrl+shift+z`"), app: z.string().optional().describe("the app") }),
    output: z.object({ done: z.string().describe("done") }),
    errors,
    writes: [],
    http: { method: "post", path: "/desktop/press" },
    examples: [{ summary: "undo", input: { combo: "cmd+z" }, output: { done: "press cmd+z" } }],
    async handler({ combo, app }, context) {
      const ran = await desktop(runner, context, "desktop.press", ["press", combo, ...(app ? ["--app", app] : [])]);
      return ran.ok ? { done: `press ${combo}` } : fail(FAILED, ran.why);
    },
  });

  return [snapshot, click, type, press];
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-agent-desktop",
  configSchema,
  operations: desktopOperations(new NodeCommandRunner()),
  register() {},
});
