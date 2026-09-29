import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { SlackApi, TooLarge } from "./SlackApi.js";
import { ThreadMap } from "./ThreadMap.js";

export interface SlackConversationOptions {
  /** A channel id, not a name. */
  channel: string;
  /** The only user whose replies are answers. */
  operator: string;
  /** Where the thread map and downloaded files live. */
  directory: string;
  /** How long to wait for another process opening a thread. */
  lockWaitMs?: number;
  /** The largest attachment downloaded; a larger one is named in the reply instead. */
  maxFileBytes?: number;
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

/** What marks a root as amy's, and whose work it opened. */
const ROOT_EVENT = "amy_work_thread";

export class SlackConversation implements Conversation {
  private readonly threads: ThreadMap;
  private readonly filesDirectory: string;
  private readonly opening = new Map<string, Promise<ThreadRef>>();
  private botUser?: Promise<string>;

  constructor(
    private readonly api: SlackApi,
    private readonly options: SlackConversationOptions,
  ) {
    this.threads = new ThreadMap(options.directory, { maxWaitMs: options.lockWaitMs });
    this.filesDirectory = path.join(options.directory, "files");
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    const known = this.threads.known(workId, this.options.channel);
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
    const { body } = await this.api.call("chat.postMessage", {
      channel: this.options.channel,
      thread_ts: thread.id,
      text: message.text,
    });
    return String(body.ts);
  }

  async replies(thread: ThreadRef, since: string): Promise<Reply[]> {
    const after = Date.parse(since);
    if (Number.isNaN(after)) throw new Error(`replies since ${since}: not an instant`);
    const bot = await this.botUserId();

    const answers: Reply[] = [];
    for (const message of await this.threadMessages(thread.id, after)) {
      if (!this.isOperatorAnswer(message, thread.id, bot)) continue;
      const at = tsToMs(message.ts!);
      if (at <= after) continue;
      const { paths, skipped } = await this.downloadAll(message.files ?? []);
      answers.push({
        at: new Date(at).toISOString(),
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

  private async channelChecks(scopes: readonly string[]): Promise<SlackCheck[]> {
    const label = `slack channel ${this.options.channel}`;
    try {
      const { body } = await this.api.call("conversations.info", { channel: this.options.channel });
      const channel = (body.channel ?? {}) as { name?: string; is_private?: boolean };
      const isPrivate = channel.is_private === true;
      const checks: SlackCheck[] = [{ label, ok: true, detail: `#${channel.name ?? "?"}` }];
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

  /** Every message in the thread after `after`, across pages. */
  private threadMessages(ts: string, after: number): Promise<SlackMessage[]> {
    return this.pages("conversations.replies", { channel: this.options.channel, ts, oldest: msToTs(after) });
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
  private async downloadAll(files: readonly SlackFile[]): Promise<{ paths: string[]; skipped: string[] }> {
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
        paths.push(await this.download(file.id, name, url, limit));
      } catch (error) {
        if (!(error instanceof TooLarge)) throw error;
        skipped.push(tooLarge);
      }
    }
    return { paths, skipped };
  }

  private async download(id: string, name: string, url: string, limit: number): Promise<string> {
    const target = path.join(this.filesDirectory, safeName(id), safeName(name));
    if (fs.existsSync(target)) return target;
    const bytes = await this.api.download(url, limit);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Staged and renamed, so a path that exists is always a whole file.
    const partial = `${target}.${randomUUID()}.partial`;
    try {
      fs.writeFileSync(partial, bytes, { flag: "wx" });
      fs.renameSync(partial, target);
    } finally {
      fs.rmSync(partial, { force: true });
    }
    return target;
  }
}

/** Slack's `ts` is seconds with a microsecond fraction. */
function tsToMs(ts: string): number {
  return Math.floor(Number(ts) * 1000);
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
