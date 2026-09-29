import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { SlackApi, TooLarge } from "./SlackApi.js";
import { ThreadMap, privateDirectory } from "./ThreadMap.js";

export interface SlackConversationOptions {
  /** A channel id, not a name. */
  channel: string;
  /** The only user whose replies are answers. */
  operator: string;
  /** Where the thread map and downloaded files live. */
  directory: string;
  /** How long to wait for another process opening a thread. */
  lockWaitMs?: number;
  /** How long a claim on a thread holds without being renewed. */
  leaseMs?: number;
  /** The largest attachment downloaded; a larger one is named in the reply instead. */
  maxFileBytes?: number;
  /**
   * Days a downloaded file or a thread's memory stays unused before it is
   * pruned; `0` keeps everything.
   */
  retentionDays?: number;
  now?: () => Date;
}

/** What `amy doctor` prints for this plugin, one line per question. */
export interface SlackCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

interface SlackFile {
  id?: string;
  name?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

interface SlackMessage {
  ts?: string;
  thread_ts?: string;
  metadata?: { event_type?: string; event_payload?: Record<string, unknown> };
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  files?: SlackFile[];
}

/**
 * One Slack thread per piece of work, in one channel.
 *
 * The thread is remembered on disk by work id, so a restart posts into the
 * thread it already opened instead of opening a second one. A root Slack
 * accepted just before a crash is found again in the channel's history
 * rather than posted twice.
 */
/** Large enough for any screenshot, small enough that a daemon never holds a video. */
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Long enough for an operator's holiday, short enough that screenshots do not pile up. */
export const DEFAULT_RETENTION_DAYS = 30;

/** Pruning walks the state directory, so it happens at most this often. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What marks a root as amy's, and whose work it opened. */
const ROOT_EVENT = "amy_work_thread";

export class SlackConversation implements Conversation {
  private readonly threads: ThreadMap;
  private readonly filesDirectory: string;
  private readonly opening = new Map<string, Promise<ThreadRef>>();
  private botUser?: Promise<string>;
  private prunedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly api: SlackApi,
    private readonly options: SlackConversationOptions,
  ) {
    this.threads = new ThreadMap(options.directory, {
      maxWaitMs: options.lockWaitMs,
      leaseMs: options.leaseMs,
      // A root replaced in another channel takes its downloads with it.
      onDisplaced: (ts) => this.dropFiles(ts),
    });
    this.filesDirectory = path.join(options.directory, "files");
    // The operator's screenshots, fetched with the bot's token: private.
    privateDirectory(this.filesDirectory);
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    let known: string | undefined;
    try {
      // Known first, which marks it used, so the prune after it keeps it.
      known = this.threads.known(workId, this.options.channel);
    } catch (error) {
      // A promise-returning method rejects; it does not throw at the caller.
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.pruneNowAndThen();
    if (known) return Promise.resolve({ id: known });

    // Two looks at the same work in one process must not open two threads.
    const pending = this.opening.get(workId);
    if (pending) return pending;
    const opened = this.startThread(workId, title).finally(() => this.opening.delete(workId));
    this.opening.set(workId, opened);
    return opened;
  }

  async post(thread: ThreadRef, message: { text: string; files?: string[] }): Promise<string> {
    if (message.files?.length) {
      // Uploading needs `files:write`, which this plugin does not ask for:
      // amy asks in words, and the operator's pictures come the other way.
      throw new Error("@amykit/plugin-slack does not upload files; post their paths as text");
    }
    // Writing to a thread is using it, as reading its replies is.
    this.threads.used(thread.id);
    this.pruneNowAndThen();
    const { body } = await this.api.call("chat.postMessage", {
      channel: this.options.channel,
      thread_ts: thread.id,
      text: message.text,
    });
    return String(body.ts);
  }

  async replies(thread: ThreadRef, since: string): Promise<Reply[]> {
    const after = instantToMicros(since);
    if (Number.isNaN(after)) throw new Error(`replies since ${since}: not an instant`);
    // Reading a thread is using it, whether or not the caller opened it
    // first — marked before the prune, so the prune never takes it.
    this.threads.used(thread.id);
    this.pruneNowAndThen();
    const bot = await this.botUserId();

    const answers: Reply[] = [];
    for (const message of await this.threadMessages(thread.id, after)) {
      if (!this.isOperatorAnswer(message, thread.id, bot)) continue;
      const at = tsToMicros(message.ts!);
      if (at <= after) continue;
      const { paths, skipped } = await this.downloadAll(thread.id, message.files ?? []);
      answers.push({
        at: microsToInstant(at),
        author: message.user!,
        text: [message.text ?? "", ...skipped].filter(Boolean).join("\n"),
        files: paths,
      });
    }
    return answers.sort((a, b) => a.at.localeCompare(b.at));
  }

  /**
   * Whether the token can do what this plugin does, asked of Slack itself.
   *
   * `auth.test` for the token, its `x-oauth-scopes` header for the scopes,
   * and `conversations.info` for whether the channel is one the bot can see
   * — which also says whether the history scope it needs is the public or
   * the private one.
   */
  async checks(): Promise<SlackCheck[]> {
    try {
      const { body, headers } = await this.api.call("auth.test");
      const scopes = (headers["x-oauth-scopes"] ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);
      const checks: SlackCheck[] = [{ label: "slack token", ok: true, detail: `${String(body.user)} in ${String(body.team)}` }];
      return checks.concat(await this.channelChecks(scopes));
    } catch (error) {
      return [{ label: "slack token", ok: false, detail: messageOf(error) }];
    }
  }

  /**
   * Forgets one piece of work: its thread's memory and every file downloaded
   * from it. The thread stays in Slack; the next `open` starts a new one.
   */
  forget(workId: string): void {
    const ts = this.threads.forget(workId);
    if (ts) this.dropFiles(ts);
  }

  /**
   * Removes what nobody used within the retention: a downloaded file, which
   * the next read of its reply fetches again, and a thread's memory, whose
   * files go with it. Returns how many of each went.
   */
  prune(now: Date = this.clock()): { threads: number; files: number } {
    // Whatever a forget marked and did not get to remove goes first, even
    // when retention keeps everything else: that was a decision, not an age.
    sweepForgotten(this.filesDirectory);
    const days = this.options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    if (days <= 0) return { threads: 0, files: 0 };
    const cutoff = now.getTime() - days * DAY_MS;

    const threads = this.threads.prune(cutoff);
    for (const ts of threads) this.dropFiles(ts);
    return { threads: threads.length, files: pruneFiles(this.filesDirectory, cutoff) };
  }

  private clock(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Where one thread's downloads live, so forgetting it takes them too. */
  private threadFiles(ts: string): string {
    return path.join(this.filesDirectory, safeName(ts));
  }

  /** Beside the thread's files, not in them, so removing those leaves it. */
  private forgottenMarker(ts: string): string {
    return path.join(this.filesDirectory, `${safeName(ts)}.forgotten`);
  }

  /**
   * Marks the thread forgotten, then removes its files. The marker is what a
   * download still in flight — in this process or another — reads after it
   * publishes, so it cannot bring a forgotten thread's file back.
   */
  private dropFiles(ts: string): void {
    privateDirectory(this.filesDirectory);
    fs.writeFileSync(this.forgottenMarker(ts), "", { mode: 0o600 });
    fs.rmSync(this.threadFiles(ts), { recursive: true, force: true });
  }

  /** Throttled, and never the reason a call fails: pruning is housekeeping. */
  private pruneNowAndThen(): void {
    const now = this.clock();
    if (now.getTime() - this.prunedAt < PRUNE_EVERY_MS) return;
    this.prunedAt = now.getTime();
    try {
      this.prune(now);
    } catch {
      // A file another process removed first, or one still being written.
    }
  }

  private async channelChecks(scopes: readonly string[]): Promise<SlackCheck[]> {
    const label = `slack channel ${this.options.channel}`;
    try {
      const { body } = await this.api.call("conversations.info", { channel: this.options.channel });
      const channel = (body.channel ?? {}) as { name?: string; is_private?: boolean; is_member?: boolean };
      const isPrivate = channel.is_private === true;
      const name = `#${channel.name ?? "?"}`;
      // A public channel can be read without joining it, but `chat:write`
      // only posts where the bot is a member.
      const checks: SlackCheck[] = [
        channel.is_member === false
          ? { label, ok: false, detail: `the bot is not in ${name}; invite it there with /invite` }
          : { label, ok: true, detail: name },
      ];
      const needed = [
        "chat:write",
        isPrivate ? "groups:read" : "channels:read",
        isPrivate ? "groups:history" : "channels:history",
        "files:read",
      ];
      const missing = needed.filter((scope) => !scopes.includes(scope));
      checks.push({
        label: "slack scopes",
        ok: missing.length === 0,
        detail: missing.length === 0 ? needed.join(", ") : `missing ${missing.join(", ")}`,
      });
      return checks;
    } catch (error) {
      return [{ label, ok: false, detail: messageOf(error) }];
    }
  }

  /**
   * Exactly one process posts a root per attempt; an attempt that follows
   * one that may have reached Slack looks for that root before posting.
   */
  private async startThread(workId: string, title: string): Promise<ThreadRef> {
    const channel = this.options.channel;
    const ts = await this.threads.open(workId, channel, async (recoverSince) => {
      const recovered = recoverSince === undefined ? undefined : await this.findRoot(workId, recoverSince);
      if (recovered) return recovered;
      const { body } = await this.api.call("chat.postMessage", {
        channel,
        text: title,
        metadata: JSON.stringify({ event_type: ROOT_EVENT, event_payload: { work_id: workId } }),
      });
      return String(body.ts);
    }, async (superseded) => {
      // Best effort: a root that cannot be deleted is a stray message in the
      // channel, never a second thread this machine remembers.
      await this.api.call("chat.delete", { channel, ts: superseded }).catch(() => undefined);
    });
    return { id: ts };
  }

  /**
   * The root this bot posted for this work since `since`, if Slack took one.
   *
   * Matched by the work id carried in the root's metadata, never by its
   * text: two items can share a title, and a title can change.
   */
  private async findRoot(workId: string, since: number): Promise<string | undefined> {
    const bot = await this.botUserId();
    const messages = await this.pages("conversations.history", {
      channel: this.options.channel,
      oldest: msToTs(since - 1000),
      include_all_metadata: "true",
    });
    const root = messages.find((message) =>
      message.user === bot &&
      (!message.thread_ts || message.thread_ts === message.ts) &&
      message.metadata?.event_type === ROOT_EVENT &&
      message.metadata.event_payload?.work_id === workId);
    return root?.ts;
  }

  /** Every message in the thread after `afterMicros`, across pages. */
  private threadMessages(ts: string, afterMicros: number): Promise<SlackMessage[]> {
    return this.pages("conversations.replies", { channel: this.options.channel, ts, oldest: microsToTs(afterMicros) });
  }

  private async pages(method: string, args: Record<string, string>): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;
    do {
      const { body } = await this.api.call(method, { ...args, cursor });
      messages.push(...((body.messages ?? []) as SlackMessage[]));
      const next = (body.response_metadata as { next_cursor?: string } | undefined)?.next_cursor;
      cursor = body.has_more === true && next ? next : undefined;
    } while (cursor);
    return messages;
  }

  /** By author id, never by a marker in the text. */
  private isOperatorAnswer(message: SlackMessage, threadTs: string, bot: string): boolean {
    if (!message.ts || message.ts === threadTs) return false;
    if (message.bot_id || message.user === bot) return false;
    if (message.subtype && message.subtype !== "thread_broadcast" && message.subtype !== "file_share") return false;
    return message.user === this.options.operator;
  }

  /** Cached once known; a failure is not, so the next poll asks again. */
  private botUserId(): Promise<string> {
    this.botUser ??= this.api.call("auth.test").then(
      ({ body }) => String(body.user_id),
      (error: unknown) => {
        this.botUser = undefined;
        throw error;
      },
    );
    return this.botUser;
  }

  /**
   * The attachments as local paths, and a line naming each one too large to
   * fetch — declared so by Slack, or found so while it arrived — so the
   * reader knows a file was there rather than never seeing it.
   */
  private async downloadAll(threadTs: string, files: readonly SlackFile[]): Promise<{ paths: string[]; skipped: string[] }> {
    const limit = this.options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const paths: string[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const url = file.url_private_download ?? file.url_private;
      if (!file.id || !url) continue;
      const name = file.name ?? file.id;
      const tooLarge = `[${name} was not downloaded: it is larger than ${limit} bytes]`;
      if ((file.size ?? 0) > limit) {
        skipped.push(tooLarge);
        continue;
      }
      try {
        const kept = await this.download(threadTs, path.join(this.threadFiles(threadTs), safeName(file.id), safeName(name)), url, limit);
        if (kept) paths.push(kept);
      } catch (error) {
        if (!(error instanceof TooLarge)) throw error;
        skipped.push(tooLarge);
      }
    }
    return { paths, skipped };
  }

  /** The file's local path, or nothing when its thread was forgotten. */
  private async download(threadTs: string, target: string, url: string, limit: number): Promise<string | undefined> {
    if (fs.existsSync(this.forgottenMarker(threadTs))) return undefined;
    if (keptAgain(target)) return target;
    const bytes = await this.api.download(url, limit);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    // Staged and renamed, so a path that exists is always a whole file.
    const partial = `${target}.${randomUUID()}.partial`;
    try {
      fs.writeFileSync(partial, bytes, { flag: "wx", mode: 0o600 });
      fs.renameSync(partial, target);
    } finally {
      fs.rmSync(partial, { force: true });
    }
    // Published first, checked after: a forget that landed while the bytes
    // were arriving is seen here, whichever of the two finished first.
    if (fs.existsSync(this.forgottenMarker(threadTs))) {
      fs.rmSync(this.threadFiles(threadTs), { recursive: true, force: true });
      return undefined;
    }
    return target;
  }
}

/**
 * Whether a file was already downloaded, marking it used if so: retention
 * counts from the last use. One pruned between the look and the touch is a
 * miss, and is fetched again.
 */
function keptAgain(target: string): boolean {
  const now = new Date();
  try {
    fs.utimesSync(target, now, now);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Removes files older than `cutoff`, then the directories they leave empty.
 * The forgotten markers directly under `files/` are kept for good: a stale
 * reference read later must still find one. Anything deeper is an attachment,
 * whatever it is called, and ages like one.
 */
function pruneFiles(directory: string, cutoff: number, top = true): number {
  let removed = 0;
  for (const entry of direntsOf(directory)) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removed += pruneFiles(full, cutoff, false);
      removeIfEmpty(full);
    } else if (!(top && entry.name.endsWith(".forgotten")) && removeIfStale(full, cutoff)) {
      removed += 1;
    }
  }
  return removed;
}

/**
 * Moves the file aside, then asks its age again, and puts it back if a
 * reader touched it first. A reader's touch lands either before the move —
 * seen here, and the file stays — or after it, where it misses and the file
 * is fetched again; so a path a reader was handed is never removed under it.
 */
function removeIfStale(file: string, cutoff: number): boolean {
  // Another prune may have taken any of these first; then it is handled.
  const before = mtimeOf(file);
  if (before === undefined || before >= cutoff) return false;
  const aside = `${file}.${randomUUID()}.pruning`;
  if (!ignoringGone(() => fs.renameSync(file, aside))) return false;
  const after = mtimeOf(aside);
  if (after === undefined) return false;
  if (after >= cutoff) {
    ignoringGone(() => fs.renameSync(aside, file));
    return false;
  }
  fs.rmSync(aside, { force: true });
  return true;
}

function mtimeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Runs it; false when what it touched was already gone. */
function ignoringGone(act: () => void): boolean {
  try {
    act();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Removes the files of every thread a marker says was forgotten; idempotent. */
function sweepForgotten(directory: string): void {
  for (const entry of direntsOf(directory)) {
    if (!entry.isFile() || !entry.name.endsWith(".forgotten")) continue;
    fs.rmSync(path.join(directory, entry.name.slice(0, -".forgotten".length)), { recursive: true, force: true });
  }
}

function direntsOf(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** A download may be filling it again right now; then it is not empty. */
function removeIfEmpty(directory: string): void {
  try {
    fs.rmdirSync(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOENT") throw error;
  }
}

/**
 * Slack's `ts` is seconds with a microsecond fraction, read exactly: a reply
 * a fraction of a millisecond after `since` is still after it.
 */
function tsToMicros(ts: string): number {
  const [seconds = "0", fraction = ""] = ts.split(".");
  return Number(seconds) * 1_000_000 + Number(fraction.padEnd(6, "0").slice(0, 6));
}

/**
 * A reply's instant to the microsecond, as ISO 8601 with six fractional
 * digits. Handed back as the next `since` it is exactly the reply's, so the
 * reply is not returned twice and one a microsecond later is not lost.
 */
function microsToInstant(micros: number): string {
  const iso = new Date(Math.floor(micros / 1000)).toISOString();
  return iso.replace(/Z$/, `${String(micros % 1000).padStart(3, "0")}Z`);
}

/** An instant to the microsecond: the digits past the millisecond are read too. */
function instantToMicros(instant: string): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return Number.NaN;
  const extra = /\.\d{3}(\d{1,3})Z$/.exec(instant)?.[1] ?? "";
  return ms * 1000 + Number(extra.padEnd(3, "0"));
}

/** Exact, where going through milliseconds would drop the last three digits. */
function microsToTs(micros: number): string {
  return `${Math.floor(micros / 1_000_000)}.${String(micros % 1_000_000).padStart(6, "0")}`;
}

function msToTs(ms: number): string {
  return (ms / 1000).toFixed(6);
}

/** A name from a message, made into one path segment. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned || "file";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
