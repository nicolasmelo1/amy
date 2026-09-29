import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { SlackApi } from "./SlackApi.js";

export interface SlackConversationOptions {
  /** A channel id, not a name. */
  channel: string;
  /** The only user whose replies are answers. */
  operator: string;
  /** Where the thread map and downloaded files live. */
  directory: string;
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
  url_private?: string;
  url_private_download?: string;
}

interface SlackMessage {
  ts?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  files?: SlackFile[];
}

interface RememberedThread {
  channel: string;
  ts: string;
}

/**
 * One Slack thread per piece of work, in one channel.
 *
 * The thread is remembered on disk by work id, so a restart posts into the
 * thread it already opened instead of opening a second one.
 */
export class SlackConversation implements Conversation {
  private readonly threadsFile: string;
  private readonly filesDirectory: string;
  private readonly opening = new Map<string, Promise<ThreadRef>>();
  private botUser?: Promise<string>;

  constructor(
    private readonly api: SlackApi,
    private readonly options: SlackConversationOptions,
  ) {
    this.threadsFile = path.join(options.directory, "threads.json");
    this.filesDirectory = path.join(options.directory, "files");
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    const remembered = this.remembered()[workId];
    if (remembered?.channel === this.options.channel) return Promise.resolve({ id: remembered.ts });

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
      answers.push({
        at: new Date(at).toISOString(),
        author: message.user!,
        text: message.text ?? "",
        files: await this.downloadAll(message.files ?? []),
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
      const needed = ["chat:write", isPrivate ? "groups:history" : "channels:history", "files:read"];
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

  private async startThread(workId: string, title: string): Promise<ThreadRef> {
    const { body } = await this.api.call("chat.postMessage", { channel: this.options.channel, text: title });
    const ts = String(body.ts);
    this.remember(workId, { channel: this.options.channel, ts });
    return { id: ts };
  }

  /** Every message in the thread after `after`, across pages. */
  private async threadMessages(ts: string, after: number): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;
    do {
      const { body } = await this.api.call("conversations.replies", {
        channel: this.options.channel,
        ts,
        oldest: msToTs(after),
        cursor,
      });
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

  private botUserId(): Promise<string> {
    this.botUser ??= this.api.call("auth.test").then(({ body }) => String(body.user_id));
    return this.botUser;
  }

  private async downloadAll(files: readonly SlackFile[]): Promise<string[]> {
    const paths: string[] = [];
    for (const file of files) {
      const url = file.url_private_download ?? file.url_private;
      if (!file.id || !url) continue;
      paths.push(await this.download(file.id, file.name ?? file.id, url));
    }
    return paths;
  }

  private async download(id: string, name: string, url: string): Promise<string> {
    const target = path.join(this.filesDirectory, safeName(id), safeName(name));
    if (fs.existsSync(target)) return target;
    const bytes = await this.api.download(url);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return target;
  }

  private remembered(): Record<string, RememberedThread> {
    if (!fs.existsSync(this.threadsFile)) return {};
    return JSON.parse(fs.readFileSync(this.threadsFile, "utf8")) as Record<string, RememberedThread>;
  }

  /** Written whole and renamed into place, so a crash never leaves half a map. */
  private remember(workId: string, thread: RememberedThread): void {
    const threads = { ...this.remembered(), [workId]: thread };
    fs.mkdirSync(this.options.directory, { recursive: true });
    const partial = `${this.threadsFile}.${process.pid}.tmp`;
    fs.writeFileSync(partial, JSON.stringify(threads, null, 2));
    fs.renameSync(partial, this.threadsFile);
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
