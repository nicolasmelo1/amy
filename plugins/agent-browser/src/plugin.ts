import {
  CommandRunner,
  ConfigOf,
  ConfigSchema,
  Harness,
  NodeCommandRunner,
  OperationContext,
  defineOperation,
  definePlugin,
  fail,
  scopeOf,
} from "@amykit/core";
import { z } from "zod";

export const configSchema = {
  binary: { type: "string", default: "agent-browser", description: "the agent-browser command, or a path to it" },
  session: { type: "string", default: "amy", description: "the agent-browser session every operation drives, so steps of one scenario share one browser" },
  timeoutMs: { type: "number", default: 60 * 1000, description: "how long one agent-browser command may run" },
} satisfies ConfigSchema;

type Settings = ConfigOf<typeof configSchema>;

const FAILED = "browser.failed";
const errors = { [FAILED]: { description: "agent-browser answered with an error, or did not answer" } };

/**
 * One agent-browser command, read through its JSON envelope
 * (`{ success, data, error }`, https://agent-browser.dev/snapshots).
 */
async function browser(runner: CommandRunner, context: OperationContext, id: string, args: readonly string[]): Promise<{ ok: true; data: unknown; text: string } | { ok: false; why: string }> {
  const { settings } = scopeOf<Settings>(context, id);
  const ran = await runner.run(settings.binary, ["--json", "--session", settings.session, ...args], { timeoutMs: settings.timeoutMs });
  const envelope = readEnvelope(ran.stdout);
  if (!ran.ok || envelope?.success === false) {
    const said = envelope?.error === undefined ? `${ran.stderr}${ran.stdout}`.trim() : JSON.stringify(envelope.error);
    return { ok: false, why: `\`${settings.binary} ${args.join(" ")}\` failed (exit ${ran.exitCode ?? "killed"}): ${said}` };
  }
  return { ok: true, data: envelope?.data ?? null, text: ran.stdout };
}

function readEnvelope(stdout: string): { success?: boolean; data?: unknown; error?: unknown } | undefined {
  try {
    const parsed = JSON.parse(stdout.trim()) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as { success?: boolean; data?: unknown; error?: unknown } : undefined;
  } catch {
    return undefined;
  }
}

/** The text a diff left: agent-browser's own lines, whatever field its envelope carried them in. */
function diffText(answer: { data: unknown; text: string }): string {
  if (typeof answer.data === "string") return answer.data;
  if (typeof answer.data === "object" && answer.data !== null) {
    for (const value of Object.values(answer.data)) if (typeof value === "string" && value.trim() !== "") return value;
    return JSON.stringify(answer.data);
  }
  return answer.text;
}

/** `3 additions, 2 removals, 41 unchanged`, as `diff snapshot` summarises (https://agent-browser.dev/diffing). */
export function readSnapshotDiff(text: string): { readonly identical: boolean; readonly additions: number; readonly removals: number } {
  const additions = Number(/(\d+) additions?/.exec(text)?.[1] ?? NaN);
  const removals = Number(/(\d+) removals?/.exec(text)?.[1] ?? NaN);
  if (Number.isNaN(additions) || Number.isNaN(removals)) {
    const changed = text.split("\n").filter((line) => /^[+-](?![+-])/.test(line)).length;
    return { identical: changed === 0, additions: changed, removals: 0 };
  }
  return { identical: additions + removals === 0, additions, removals };
}

/** The mismatch `diff screenshot` reports, or that the images' sizes differ and nothing was compared. */
export function readScreenshotDiff(text: string): { readonly sizeMismatch: true } | { readonly sizeMismatch: false; readonly mismatchPercent: number } {
  if (/dimension|size mismatch|sizes? differ/i.test(text)) return { sizeMismatch: true };
  const percent = /(\d+\.?\d*) ?%/.exec(text)?.[1];
  if (percent === undefined) throw new Error(`agent-browser's screenshot diff said no mismatch to read: ${text.slice(0, 200)}`);
  return { sizeMismatch: false, mismatchPercent: Number(percent) };
}

/** The operations, reaching agent-browser through the runner given: the machine's own, or a test's. */
export function browserOperations(runner: CommandRunner) {
  const open = defineOperation({
    id: "browser.open",
    domain: "browser",
    summary: "Open a URL in the session's browser",
    description: "Runs `agent-browser open <url>` in the configured session.",
    input: z.object({ url: z.string().min(1).describe("the page to open") }),
    output: z.object({ opened: z.string().describe("opened") }),
    errors,
    writes: [],
    http: { method: "post", path: "/browser/open" },
    examples: [{ summary: "open the invoice", input: { url: "https://shop.localhost/invoices/1" }, output: { opened: "https://shop.localhost/invoices/1" } }],
    async handler({ url }, context) {
      const ran = await browser(runner, context, "browser.open", ["open", url]);
      return ran.ok ? { opened: url } : fail(FAILED, ran.why);
    },
  });

  const snapshot = defineOperation({
    id: "browser.snapshot",
    domain: "browser",
    summary: "Read the page's accessibility tree, with refs to act on",
    description: "Runs `agent-browser snapshot`; `interactive` keeps only elements one can act on (`-i`).",
    input: z.object({ interactive: z.boolean().default(false).describe("keep only interactive elements") }),
    output: z.object({ snapshot: z.string().describe("tree"), refs: z.record(z.string(), z.unknown()).describe("refs") }),
    errors,
    writes: [],
    http: { method: "post", path: "/browser/snapshot" },
    examples: [{ summary: "the tree", input: { interactive: true }, output: { snapshot: '- button "Pay" [ref=e1]', refs: { e1: { role: "button", name: "Pay" } } } }],
    async handler({ interactive }, context) {
      const ran = await browser(runner, context, "browser.snapshot", ["snapshot", ...(interactive ? ["-i"] : [])]);
      if (!ran.ok) return fail(FAILED, ran.why);
      const data = (ran.data ?? {}) as { snapshot?: unknown; refs?: unknown };
      return { snapshot: typeof data.snapshot === "string" ? data.snapshot : "", refs: typeof data.refs === "object" && data.refs !== null ? data.refs as Record<string, unknown> : {} };
    },
  });

  const act = defineOperation({
    id: "browser.act",
    domain: "browser",
    summary: "Click, fill or type into the element a snapshot ref names",
    description: "Runs `agent-browser click @ref`, `fill @ref -- text` or `type @ref -- text`. A hidden, disabled or covered target fails rather than reporting success.",
    input: z.object({
      action: z.enum(["click", "fill", "type"]).describe("what to do"),
      ref: z.string().regex(/^@?e\d+$/).describe("the ref a snapshot named, as `e3` or `@e3`"),
      text: z.string().optional().describe("what to fill or type"),
    }),
    output: z.object({ done: z.string().describe("done") }),
    errors: { ...errors, "browser.text": { description: "fill and type need text" } },
    writes: [],
    http: { method: "post", path: "/browser/act" },
    examples: [{ summary: "pay", input: { action: "click", ref: "e1" }, output: { done: "click @e1" } }],
    async handler({ action, ref, text }, context) {
      const at = ref.startsWith("@") ? ref : `@${ref}`;
      if (action !== "click" && text === undefined) return fail("browser.text", `\`${action}\` needs the text to ${action}`);
      const args = action === "click" ? [action, at] : [action, at, "--", text!];
      const ran = await browser(runner, context, "browser.act", args);
      return ran.ok ? { done: `${action} ${at}` } : fail(FAILED, ran.why);
    },
  });

  const diffSnapshot = defineOperation({
    id: "browser.diff-snapshot",
    domain: "browser",
    summary: "Compare the page's accessibility tree with a baseline, as text",
    description: "Runs `agent-browser diff snapshot --baseline <file>` and reads its summary of additions and removals.",
    input: z.object({ baseline: z.string().min(1).describe("the baseline snapshot file") }),
    output: z.object({ identical: z.boolean().describe("identical"), additions: z.number().describe("added"), removals: z.number().describe("removed"), diff: z.string().describe("diff") }),
    errors,
    writes: [],
    http: { method: "post", path: "/browser/diff-snapshot" },
    examples: [{ summary: "nothing moved", input: { baseline: "invoice.tree" }, output: { identical: true, additions: 0, removals: 0, diff: "0 additions, 0 removals, 41 unchanged" } }],
    async handler({ baseline }, context) {
      const ran = await browser(runner, context, "browser.diff-snapshot", ["diff", "snapshot", "--baseline", baseline]);
      if (!ran.ok) return fail(FAILED, ran.why);
      const diff = diffText(ran);
      return { ...readSnapshotDiff(diff), diff };
    },
  });

  const diffScreenshot = defineOperation({
    id: "browser.diff-screenshot",
    domain: "browser",
    summary: "Compare the page's pixels with a baseline image",
    description: "Runs `agent-browser diff screenshot --baseline <image> --threshold <0..1>`. A baseline of another size is reported as a size mismatch, not compared.",
    input: z.object({
      baseline: z.string().min(1).describe("the baseline image"),
      threshold: z.number().min(0).max(1).default(0.1).describe("the colour distance two pixels may differ by and still match"),
    }),
    output: z.object({ sizeMismatch: z.boolean().describe("sizes differ"), mismatchPercent: z.number().optional().describe("pixels differing, in percent") }),
    errors,
    writes: [],
    http: { method: "post", path: "/browser/diff-screenshot" },
    examples: [{ summary: "a near match", input: { baseline: "invoice.png", threshold: 0.1 }, output: { sizeMismatch: false, mismatchPercent: 0.2 } }],
    async handler({ baseline, threshold }, context) {
      const ran = await browser(runner, context, "browser.diff-screenshot", ["diff", "screenshot", "--baseline", baseline, "--threshold", String(threshold)]);
      if (!ran.ok) return fail(FAILED, ran.why);
      return readScreenshotDiff(diffText(ran));
    },
  });

  const uiCheck = defineOperation({
    id: "browser.ui-check",
    domain: "browser",
    summary: "Check the page against the planned design: structure, then pixels, then an agent",
    description:
      "Passes when the accessibility tree matches its baseline and the pixels differ within `tolerancePercent`. Anything else goes to an agent, " +
      "with what the diffs said; what the agent cannot settle, or a baseline image of another size, is `unsupported` — never a pass.",
    input: z.object({
      tree: z.string().min(1).describe("the baseline accessibility tree"),
      image: z.string().min(1).describe("the planned design, as an image"),
      threshold: z.number().min(0).max(1).default(0.1).describe("the colour distance two pixels may differ by and still match"),
      tolerancePercent: z.number().min(0).max(100).default(0).describe("how many pixels, in percent, may differ"),
      question: z.string().default("Does the page match the planned design?").describe("what the agent is asked when the diffs do not settle it"),
    }),
    output: z.object({
      status: z.enum(["passed", "failed", "unsupported"]).describe("status"),
      by: z.enum(["structure-and-pixels", "agent", "nothing"]).describe("settled by"),
      why: z.string().optional().describe("why"),
    }),
    errors,
    writes: [],
    mount: true,
    http: { method: "post", path: "/browser/ui-check" },
    examples: [{ summary: "the page matches", input: { tree: "invoice.tree", image: "invoice.png", threshold: 0.1, tolerancePercent: 0, question: "Does the page match?" }, output: { status: "passed", by: "structure-and-pixels" } }],
    async handler(input, context) {
      const tree = await browser(runner, context, "browser.ui-check", ["diff", "snapshot", "--baseline", input.tree]);
      if (!tree.ok) return fail(FAILED, tree.why);
      const pixels = await browser(runner, context, "browser.ui-check", ["diff", "screenshot", "--baseline", input.image, "--threshold", String(input.threshold)]);
      if (!pixels.ok) return fail(FAILED, pixels.why);
      const structure = readSnapshotDiff(diffText(tree));
      const image = readScreenshotDiff(diffText(pixels));
      if (image.sizeMismatch) return { status: "unsupported" as const, by: "nothing" as const, why: "the page and the planned design are of different sizes, so no pixel was compared" };
      if (structure.identical && image.mismatchPercent <= input.tolerancePercent) return { status: "passed" as const, by: "structure-and-pixels" as const };
      return judged(context, input.question, structure, image.mismatchPercent);
    },
  });

  return [open, snapshot, act, diffSnapshot, diffScreenshot, uiCheck];
}

/** What neither diff settled, put to an agent; what it cannot settle is unsupported. */
async function judged(context: OperationContext, question: string, structure: ReturnType<typeof readSnapshotDiff>, mismatchPercent: number) {
  const agent = context.port("agent") as Harness | undefined;
  const why = `the tree has ${structure.additions} addition(s) and ${structure.removals} removal(s), and ${mismatchPercent}% of pixels differ`;
  if (!agent) return { status: "unsupported" as const, by: "nothing" as const, why: `${why}, and no agent is mounted to settle it` };
  const reply = await agent.ask(
    `${question}\n\nThe page's accessibility tree and its pixels do not match the planned design exactly: ${why}. ` +
      'Look at the page in the browser session and answer with one JSON object as the last thing you say: {"verdict":"passed"|"failed"|"unsupported","why":"..."}.',
    scopeOf(context, "browser.ui-check").state,
  );
  const verdict = /\{[^{}]*"verdict"[^{}]*\}/.exec(reply.text)?.[0];
  let read: { verdict?: unknown; why?: unknown } = {};
  try {
    read = verdict ? JSON.parse(verdict) as typeof read : {};
  } catch {
    read = {};
  }
  if (reply.run.outcome !== "completed" || (read.verdict !== "passed" && read.verdict !== "failed")) {
    return { status: "unsupported" as const, by: "agent" as const, why: typeof read.why === "string" ? read.why : `${why}, and the agent could not settle it` };
  }
  return { status: read.verdict as "passed" | "failed", by: "agent" as const, ...(typeof read.why === "string" ? { why: read.why } : {}) };
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-agent-browser",
  configSchema,
  operations: browserOperations(new NodeCommandRunner()),
  register() {},
});
