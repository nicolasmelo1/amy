import { randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ChatAction, ChatActOutcome, ChatCommandSpec, CommandRunner, specOf } from "@amykit/core";

/**
 * The commands an answer may name under `/action`, as the command line
 * spells them (S13). This row ships before the command line's operations do,
 * so the list is the command line's; it becomes those operations when that
 * row lands. Nothing here is a shell: each runs as amy, with arguments.
 */
export const CHAT_COMMANDS: readonly ChatCommandSpec[] = [
  { words: ["status"], summary: "what each workflow is doing, and what waits on the person" },
  { words: ["doctor"], summary: "whether this machine can run, one check at a time" },
  { words: ["budget"], summary: "what the agents have spent, against the ceilings" },
  { words: ["look"], args: "<workId>", summary: "look at one piece of work now, rather than when it was next due" },
  { words: ["start"], summary: "start a workflow's loop under the machine's supervisor" },
  { words: ["stop"], summary: "stop this loop, after the answer is said; nothing starts it until `amy start`" },
  { words: ["restart"], summary: "mount the config and workflow as they are now, in a new loop; refused if it does not boot" },
  { words: ["config", "apply"], summary: "write the config.yaml block beside it: shown as a diff, written only if it mounts" },
  { words: ["config", "explain"], args: "[plugin]", summary: "what a plugin's settings are" },
  { words: ["plugin", "list"], summary: "what is mounted, and what is not" },
  { words: ["add"], args: "<spec>", summary: "add a workflow or a plugin: install it, mount it, and check the machine boots" },
  { words: ["remove"], args: "<spec> [--keep-state]", summary: "remove a workflow profile or a plugin, refusing what the machine would not survive" },
  { words: ["workflow", "list"], summary: "the workflows this machine drives" },
  { words: ["brief", "sections"], summary: "the sections the workflow's brief asks for, in the order grooming asks them" },
  { words: ["brief", "show"], args: "<id>", summary: "a brief as the workflow keeps it" },
  { words: ["brief", "write"], args: "<id> <section> \"<answer>\"", summary: "answer one section of a brief, through the workflow's brief port" },
  { words: ["brief", "check"], args: "<id>", summary: "whether a brief is ready, and the next section to ask" },
];

/** What acting needs of the process around it, so a test can be any process. */
export interface ChatActor {
  readonly runner: CommandRunner;
  /** How amy is run again: the executable and the script, before any argument. */
  readonly amy: readonly string[];
  readonly workflow: string;
  /** The machine's config.yaml. */
  readonly config: string;
  /** Where a restart's promise to say the new pid is kept. */
  readonly restartMarker: string;
  /** Why no supervisor would start a new loop, when none would (S43). */
  readonly unsupervised?: string;
  /** Ends this loop for its supervisor to start the next one; `amy stop` too. */
  readonly exit: (how: "restart" | "stop") => Promise<void>;
  readonly pid: number;
  readonly env?: Record<string, string>;
}

/** The most of one command's output said back in the chat. */
const MAX_OUTPUT = 3000;

/**
 * Runs the commands a `/action` turn's answer named, every one on the list
 * already: the core refuses a batch with one that is not (A4).
 */
export function chatAct(actor: ChatActor): (action: ChatAction) => Promise<ChatActOutcome> {
  return async ({ asked, progress, place, running, source }) => {
    const said: string[] = [];
    for (const [index, command] of asked.commands.entries()) {
      const spec = specOf(command, CHAT_COMMANDS);
      const name = spec?.words.join(" ") ?? command.argv[0];
      if (name === "config apply") {
        said.push(await applyConfig(actor, asked.blocks.get("config.yaml"), (line) => progress.line(line), running));
        continue;
      }
      // A stop or an accepted restart ends the batch: nothing after it can fail and lose it.
      const lifecycle = name === "restart"
        ? await restartFromChat(actor, place, source, (line) => progress.line(line))
        : name === "stop"
          ? { text: "Stopping this loop once this is said. Nothing starts it again until `amy start`.", after: () => actor.exit("stop") }
          : undefined;
      if (lifecycle) {
        said.push(lifecycle.text);
        if (!lifecycle.after) continue;
        running();
        const left = asked.commands.slice(index + 1).map((one) => `\`${one.line}\``);
        if (left.length > 0) said.push(`Not run, as the loop is ending: ${left.join(", ")}.`);
        return { text: said.join("\n\n"), after: lifecycle.after };
      }
      await progress.line(`Running amy ${command.argv.join(" ")}…`);
      running();
      const result = await actor.runner.run(actor.amy[0]!, [...actor.amy.slice(1), "--workflow", actor.workflow, ...command.argv], {
        timeoutMs: 10 * 60 * 1000,
        ...(actor.env ? { env: actor.env } : {}),
      });
      said.push(`amy ${command.argv.join(" ")}: ${result.ok ? "done" : `failed (exit ${result.exitCode})`}${fenced(`${result.stdout}\n${result.stderr}`)}`);
    }
    return { text: said.join("\n\n") };
  };
}

/**
 * A new config.yaml, shown as a diff and written only when it mounts (S30):
 * a child mounts it first, from a file beside the real one, and a config
 * that does not mount leaves config.yaml as it was, byte for byte.
 */
async function applyConfig(actor: ChatActor, proposed: string | undefined, line: (text: string) => Promise<void>, running: () => void): Promise<string> {
  if (proposed === undefined) return "config apply: nothing written — the answer holds no block tagged `config.yaml`.";
  const current = fs.existsSync(actor.config) ? fs.readFileSync(actor.config, "utf-8") : "";
  const next = proposed.endsWith("\n") ? proposed : `${proposed}\n`;
  if (next === current) return "config apply: config.yaml already says that; nothing written.";
  const diff = lineDiff(current, next);
  await line("Checking the new config mounts…");
  const candidate = path.join(path.dirname(actor.config), `.config.yaml.${randomUUID()}.candidate`);
  fs.mkdirSync(path.dirname(actor.config), { recursive: true });
  fs.writeFileSync(candidate, next, { mode: 0o600 });
  try {
    const checked = await actor.runner.run(actor.amy[0]!, [...actor.amy.slice(1), "--workflow", actor.workflow, "mount-check", "--config", candidate], {
      timeoutMs: 10 * 60 * 1000,
      ...(actor.env ? { env: actor.env } : {}),
    });
    if (!checked.ok) {
      return `config apply: not written — the new config does not mount, so config.yaml stays as it was.${fenced(`${checked.stdout}\n${checked.stderr}`)}\nThe change was:${fenced(diff, "diff")}`;
    }
    // Under one lock for the machine, and only over the config this was checked against:
    // a change another chat applied meanwhile is never silently replaced.
    const release = takeLock(`${actor.config}.applying`, actor.pid);
    if (!release) return "config apply: not written — another config change is being applied; ask again once it is done.";
    try {
      const now = fs.existsSync(actor.config) ? fs.readFileSync(actor.config, "utf-8") : "";
      if (now !== current) return "config apply: not written — config.yaml changed while this one was being checked; ask again against the config as it is now.";
      running();
      fs.renameSync(candidate, actor.config);
    } finally {
      release();
    }
  } finally {
    fs.rmSync(candidate, { force: true });
  }
  return `config apply: written, and it mounts. It takes effect when the loop restarts: /action restart.${fenced(diff, "diff")}`;
}

/**
 * A restart from the chat (S28): the new mount is assembled in a child first,
 * and only one that boots is let through; this loop then exits back to its
 * supervisor, and the new one says its pid here. With no supervisor nothing
 * would start the new loop, so it is refused and this one stays (S43).
 */
async function restartFromChat(actor: ChatActor, place: string, source: string | undefined, line: (text: string) => Promise<void>): Promise<ChatActOutcome> {
  if (actor.unsupervised) {
    return { text: `restart: refused — no supervisor would start the new loop (${actor.unsupervised}). This loop and the chat stay as they are, pid ${actor.pid}.` };
  }
  await line("Checking the new mount boots…");
  const config = fs.existsSync(actor.config) ? fs.readFileSync(actor.config, "utf-8") : "";
  const candidate = path.join(path.dirname(actor.config), `.config.yaml.${randomUUID()}.restart`);
  fs.mkdirSync(path.dirname(actor.config), { recursive: true });
  fs.writeFileSync(candidate, config, { mode: 0o600 });
  try {
    const checked = await actor.runner.run(actor.amy[0]!, [...actor.amy.slice(1), "--workflow", actor.workflow, "mount-check", "--config", candidate], {
      timeoutMs: 10 * 60 * 1000,
      ...(actor.env ? { env: actor.env } : {}),
    });
    if (!checked.ok) {
      return { text: `restart: not restarted — the new mount does not boot, so this loop keeps the mount it had, pid ${actor.pid}.${fenced(`${checked.stdout}\n${checked.stderr}`)}` };
    }
  } finally {
    fs.rmSync(candidate, { force: true });
  }
  fs.mkdirSync(path.dirname(actor.restartMarker), { recursive: true });
  // The next daemon mounts these exact bytes, not a config another writer can
  // replace after this probe and before the supervisor starts it.
  fs.writeFileSync(actor.restartMarker, `${JSON.stringify({ place, source, pid: actor.pid, at: new Date().toISOString(), config })}\n`, { mode: 0o600 });
  return { text: `restart: the new mount boots. Restarting pid ${actor.pid}; the new loop says its pid here.`, after: () => actor.exit("restart") };
}

/**
 * Takes the config's lock for this process, answering what releases it. One
 * left by a process that is no longer alive is recovered one taker at a time:
 * under a recovery lock its owner is read again, and only a lock still dead
 * is cleared. Release removes the lock only while it is still this one.
 */
function takeLock(lock: string, pid: number): (() => void) | undefined {
  const token = `${pid}:${randomUUID()}`;
  const create = (file: string) => {
    try {
      fs.writeFileSync(file, token, { flag: "wx", mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  };
  const release = () => {
    try {
      const held = Buffer.from(fs.readFileSync(lock, "utf-8"));
      const mine = Buffer.from(token);
      if (held.length === mine.length && timingSafeEqual(held, mine)) fs.rmSync(lock, { force: true });
    } catch {
      // Already gone.
    }
  };
  if (create(lock)) return release;
  if (!abandoned(lock)) return undefined;
  const recovery = `${lock}.recovering`;
  if (!create(recovery)) {
    if (abandoned(recovery)) fs.rmSync(recovery, { force: true });
    return undefined;
  }
  try {
    if (!abandoned(lock)) return undefined;
    fs.rmSync(lock, { force: true });
    return create(lock) ? release : undefined;
  } finally {
    fs.rmSync(recovery, { force: true });
  }
}

/** Whether a lock's recorded owner is gone, or nobody is recorded at all. */
function abandoned(file: string): boolean {
  let owner: number;
  try {
    owner = Number.parseInt(fs.readFileSync(file, "utf-8"), 10);
  } catch {
    return false;
  }
  return !(Number.isSafeInteger(owner) && owner > 0 && alive(owner));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A block of output, as much of its end as the chat holds. */
function fenced(text: string, tag = ""): string {
  const trimmed = text.replace(/^\s*\n/, "").trimEnd();
  if (!trimmed.trim()) return "";
  const kept = trimmed.length > MAX_OUTPUT ? `…${trimmed.slice(-MAX_OUTPUT)}` : trimmed;
  return `\n\`\`\`${tag}\n${kept}\n\`\`\``;
}

/**
 * The lines removed and added between two texts, with the unchanged lines
 * around each change, from their longest common run of lines.
 */
export function lineDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const common: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const lines: { mark: " " | "-" | "+"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ mark: " ", text: a[i++]! });
      j += 1;
    } else if (i < a.length && (j >= b.length || common[i + 1]![j]! >= common[i]![j + 1]!)) lines.push({ mark: "-", text: a[i++]! });
    else lines.push({ mark: "+", text: b[j++]! });
  }
  const changed = lines.map((one) => one.mark !== " ");
  const near = (at: number) => changed.slice(Math.max(0, at - 2), at + 3).some(Boolean);
  return lines.flatMap((one, at) => (near(at) ? [`${one.mark} ${one.text}`.trimEnd()] : [])).join("\n");
}
