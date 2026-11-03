import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { BotApi, BotApiRefusal } from "./BotApi.js";

export interface TelegramConversationOptions {
  /** The operator's user id, which is also their private chat with the bot. */
  operator: string;
  /** Where topics, filed replies, the update offset and downloads live. */
  directory: string;
  /** The largest file downloaded; a larger one is named in the reply instead. */
  maxFileBytes?: number;
  /** How long to wait for another process holding the directory. */
  lockWaitMs?: number;
  /** How long a hold on the directory lasts before it is taken as abandoned. */
  leaseMs?: number;
}

/** What `amy doctor` prints for this plugin, one line per question. */
export interface TelegramCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

/** The most a bot may download, by the Bot API's own limit. */
export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Telegram refuses a longer message, so a longer one is sent in parts. */
const MAX_MESSAGE_CHARS = 4096;

/** Telegram's limit on a topic's name. */
const MAX_TOPIC_NAME_CHARS = 128;

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  has_topics_enabled?: boolean;
}

interface TelegramFileRef {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_name?: string;
}

interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  document?: TelegramFileRef;
  photo?: TelegramFileRef[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

/** A reply as filed under its topic: what it said, and the files it carried, not yet fetched. */
interface Filed {
  messageId: number;
  at: string;
  author: string;
  text: string;
  files: { id: string; unique: string; name: string; size?: number }[];
}

/**
 * One topic per piece of work, in the operator's private chat with the bot.
 *
 * Telegram hands a bot its updates once, to whoever asks first, so every
 * message read is filed on disk under its topic before the offset that
 * confirms it moves. A restart, or another process mounting the same
 * directory, reads the same file rather than an update stream that has
 * already moved past it.
 */
export class TelegramConversation implements Conversation {
  private readonly opening = new Map<string, Promise<ThreadRef>>();

  constructor(
    private readonly api: BotApi,
    private readonly options: TelegramConversationOptions,
  ) {
    privateDirectory(options.directory);
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    const known = this.topics()[workId];
    if (known !== undefined) return Promise.resolve({ id: String(known) });
    // Two looks at the same work in one process must not open two topics.
    const pending = this.opening.get(workId);
    if (pending) return pending;
    const opened = this.held(async () => {
      // Another process may have opened it while this one waited.
      const topics = this.topics();
      if (topics[workId] !== undefined) return { id: String(topics[workId]) };
      const topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
        chat_id: this.chat(),
        name: topicName(title, workId),
      });
      this.writeJson("topics.json", { ...this.topics(), [workId]: topic.message_thread_id });
      return { id: String(topic.message_thread_id) };
    }).finally(() => this.opening.delete(workId));
    this.opening.set(workId, opened);
    return opened;
  }

  async post(thread: ThreadRef, message: { text: string; files?: string[] }): Promise<string> {
    if (message.files?.length) {
      // amy asks in words; the operator's pictures come the other way.
      throw new Error("@amykit/plugin-telegram does not upload files; post their paths as text");
    }
    let sent = "";
    for (const part of parts(message.text)) {
      const result = await this.api.call<{ message_id: number }>("sendMessage", {
        chat_id: this.chat(),
        message_thread_id: topicOf(thread),
        text: part,
      });
      sent = String(result.message_id);
    }
    return sent;
  }

  async replies(thread: ThreadRef, since: string): Promise<Reply[]> {
    const after = Date.parse(since);
    if (Number.isNaN(after)) throw new Error(`replies since ${since}: not an instant`);
    const topic = topicOf(thread);
    await this.held(() => this.fileUpdates());

    const replies: Reply[] = [];
    for (const filed of this.filed(topic)) {
      if (Date.parse(filed.at) <= after) continue;
      const { paths, skipped } = await this.downloadAll(topic, filed.files);
      replies.push({ at: filed.at, author: filed.author, text: [filed.text, ...skipped].filter(Boolean).join("\n"), files: paths });
    }
    return replies;
  }

  /**
   * Whether this bot can hold the conversation, asked of Telegram itself:
   * the token, the bot's topic mode, a private chat the operator started,
   * and nobody else reading its updates.
   */
  async checks(): Promise<TelegramCheck[]> {
    let me: TelegramUser;
    try {
      me = await this.api.call<TelegramUser>("getMe");
    } catch (error) {
      return [{ label: "telegram bot", ok: false, detail: messageOf(error) }];
    }
    const name = `@${me.username ?? me.id}`;
    const checks: TelegramCheck[] = [
      me.has_topics_enabled === true
        ? { label: "telegram bot", ok: true, detail: `${name}, with topics in private chats` }
        : { label: "telegram bot", ok: false, detail: `${name} has topic mode off; turn on topics for it in @BotFather, so each piece of work gets its own topic` },
    ];
    try {
      const chat = await this.api.call<{ type?: string }>("getChat", { chat_id: this.chat() });
      checks.push(chat.type === "private"
        ? { label: "telegram chat", ok: true, detail: `private chat with ${this.options.operator}` }
        : { label: "telegram chat", ok: false, detail: `${this.options.operator} is a ${chat.type ?? "chat"}, not a person; set operator to your own user id` });
    } catch (error) {
      checks.push({ label: "telegram chat", ok: false, detail: `${this.options.operator} has no chat with ${name}; open ${name} in Telegram and send /start (${messageOf(error)})` });
    }
    try {
      // Not confirming anything: no offset, so nothing filed is skipped.
      await this.api.call("getUpdates", { limit: 1, timeout: 0, allowed_updates: ["message"] });
      checks.push({ label: "telegram updates", ok: true, detail: "read by amy alone" });
    } catch (error) {
      const conflict = error instanceof BotApiRefusal && error.code === 409;
      checks.push({
        label: "telegram updates",
        ok: false,
        detail: conflict
          ? `${name}'s updates are read by something else (409 Conflict: ${error.description}); Telegram gives them to one reader, so amy needs a bot of its own`
          : messageOf(error),
      });
    }
    return checks;
  }

  private chat(): number {
    return Number(this.options.operator);
  }

  /**
   * Reads every update Telegram holds and files the operator's messages in
   * a topic under it; everything else is skipped. The offset moves only once
   * what it confirms is on disk, and a message filed twice is filed once.
   */
  private async fileUpdates(): Promise<void> {
    const topics = new Set(Object.values(this.topics()));
    for (;;) {
      const offset = this.offset();
      const updates = await this.api.call<TelegramUpdate[]>("getUpdates", {
        ...(offset === undefined ? {} : { offset }),
        timeout: 0,
        limit: 100,
        allowed_updates: ["message"],
      });
      if (updates.length === 0) return;
      for (const update of updates) {
        const message = update.message;
        if (!message || !this.isOperatorAnswer(message)) continue;
        const topic = message.message_thread_id!;
        if (!topics.has(topic)) continue;
        this.file(topic, message);
      }
      this.writeJson("offset.json", { offset: Math.max(...updates.map((update) => update.update_id)) + 1 });
    }
  }

  /** By who wrote it and where, never by a marker in the text. */
  private isOperatorAnswer(message: TelegramMessage): boolean {
    if (message.from?.is_bot) return false;
    if (String(message.from?.id) !== this.options.operator) return false;
    if (String(message.chat.id) !== this.options.operator) return false;
    return message.is_topic_message === true && message.message_thread_id !== undefined;
  }

  /**
   * Appends one message under its topic, once. Telegram says when to the
   * second; a reply is placed at the end of its second, and after the last
   * one filed, so replies keep their order and none falls before a question
   * asked earlier in the same second.
   */
  private file(topic: number, message: TelegramMessage): void {
    const filed = this.filed(topic);
    if (filed.some((one) => one.messageId === message.message_id)) return;
    const last = filed.length ? Date.parse(filed[filed.length - 1]!.at) : Number.NEGATIVE_INFINITY;
    const at = new Date(Math.max(message.date * 1000 + 999, last + 1)).toISOString();
    const largest = message.photo?.length ? [...message.photo].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0] : undefined;
    const files = [
      ...(message.document ? [{ id: message.document.file_id, unique: message.document.file_unique_id, name: message.document.file_name ?? message.document.file_unique_id, size: message.document.file_size }] : []),
      ...(largest ? [{ id: largest.file_id, unique: largest.file_unique_id, name: `${largest.file_unique_id}.jpg`, size: largest.file_size }] : []),
    ];
    const entry: Filed = { messageId: message.message_id, at, author: String(message.from!.id), text: message.text ?? message.caption ?? "", files };
    const inbox = path.join(this.options.directory, "inbox");
    privateDirectory(inbox);
    fs.appendFileSync(path.join(inbox, `${topic}.jsonl`), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  private filed(topic: number): Filed[] {
    const file = path.join(this.options.directory, "inbox", `${topic}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Filed);
  }

  /** The files as local paths, and a line naming each one too large to fetch. */
  private async downloadAll(topic: number, files: Filed["files"]): Promise<{ paths: string[]; skipped: string[] }> {
    const limit = this.options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const paths: string[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const tooLarge = `[${file.name} was not downloaded: it is larger than ${limit} bytes]`;
      if ((file.size ?? 0) > limit) {
        skipped.push(tooLarge);
        continue;
      }
      const target = path.join(this.options.directory, "files", String(topic), safeName(file.unique), safeName(file.name));
      if (!fs.existsSync(target)) {
        const found = await this.api.call<{ file_path?: string; file_size?: number }>("getFile", { file_id: file.id });
        if ((found.file_size ?? 0) > limit || !found.file_path) {
          skipped.push(tooLarge);
          continue;
        }
        const bytes = await this.api.download(found.file_path);
        if (bytes.byteLength > limit) {
          skipped.push(tooLarge);
          continue;
        }
        privateDirectory(path.dirname(target));
        // Staged and renamed, so a path that exists is always a whole file.
        const partial = `${target}.${randomUUID()}.partial`;
        fs.writeFileSync(partial, bytes, { flag: "wx", mode: 0o600 });
        fs.renameSync(partial, target);
      }
      paths.push(target);
    }
    return { paths, skipped };
  }

  private topics(): Record<string, number> {
    return this.readJson<Record<string, number>>("topics.json") ?? {};
  }

  private offset(): number | undefined {
    return this.readJson<{ offset?: number }>("offset.json")?.offset;
  }

  private readJson<T>(name: string): T | undefined {
    const file = path.join(this.options.directory, name);
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : undefined;
  }

  /** Written aside and renamed, so a reader never sees half of it. */
  private writeJson(name: string, value: unknown): void {
    const file = path.join(this.options.directory, name);
    const partial = `${file}.${randomUUID()}.partial`;
    fs.writeFileSync(partial, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(partial, file);
  }

  /**
   * Runs `work` holding the directory, which every process mounting this
   * plugin shares: one of them reads updates or opens a topic at a time. A
   * hold older than its lease belongs to a process that died, and is taken.
   */
  private async held<T>(work: () => Promise<T>): Promise<T> {
    const lock = path.join(this.options.directory, "lock");
    const lease = this.options.leaseMs ?? 60_000;
    const deadline = Date.now() + (this.options.lockWaitMs ?? 120_000);
    for (;;) {
      try {
        fs.mkdirSync(lock);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const since = mtimeOf(lock);
        if (since !== undefined && Date.now() - since > lease) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
        if (Date.now() > deadline) throw new Error(`${this.options.directory} is held by another process; waited for it and gave up`, { cause: error });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    try {
      return await work();
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }
}

function topicOf(thread: ThreadRef): number {
  const topic = Number(thread.id);
  if (!Number.isInteger(topic)) throw new Error(`${thread.id} is not a telegram topic`);
  return topic;
}

/** The title, as much of it as a topic's name holds; the work id when there is none. */
function topicName(title: string, workId: string): string {
  const name = (title.trim() || workId).replace(/\s+/g, " ");
  return name.length > MAX_TOPIC_NAME_CHARS ? `${name.slice(0, MAX_TOPIC_NAME_CHARS - 1)}…` : name;
}

/** The text in messages Telegram accepts, split at a line where one falls in reach. */
function parts(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_CHARS) {
    const cut = rest.lastIndexOf("\n", MAX_MESSAGE_CHARS);
    const at = cut > MAX_MESSAGE_CHARS / 2 ? cut : MAX_MESSAGE_CHARS;
    out.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^\n/, "");
  }
  out.push(rest);
  return out;
}

function mtimeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

/** What threads a machine's work lives in, and the operator's files, are nobody else's to read. */
function privateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
}

/** A name from a message, made into one path segment. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned || "file";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
