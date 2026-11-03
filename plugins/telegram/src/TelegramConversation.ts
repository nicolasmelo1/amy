import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { BotApi, BotApiRefusal, TooLarge } from "./BotApi.js";

export interface TelegramConversationOptions {
  /** The operator's user id, which is also their private chat with the bot. */
  operator: string;
  /** Where this profile's topics are remembered, by work id. */
  directory: string;
  /**
   * Where everything one bot shares across profiles lives: the replies filed
   * by topic, the update offset, the lock and the downloads. The directory
   * itself when not given.
   */
  shared?: string;
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

/**
 * Telegram restarts its update ids at random after a week without updates, so
 * an offset older than this is not sent: it could confirm, unread, the new
 * updates numbered below it.
 */
const OFFSET_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;

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
    privateDirectory(this.shared());
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    const known = topicFor(this.topics(), workId);
    if (known !== undefined) return Promise.resolve({ id: String(known) });
    // Two looks at the same work in one process must not open two topics.
    const pending = this.opening.get(workId);
    if (pending) return pending;
    const opened = this.held(async () => {
      // Another process may have opened it while this one waited.
      const already = topicFor(this.topics(), workId);
      if (already !== undefined) return { id: String(already) };
      const topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
        chat_id: this.chat(),
        name: topicName(title, workId),
      });
      writeJson(path.join(this.options.directory, "topics.json"), { ...this.topics(), [workId]: topic.message_thread_id });
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

  private shared(): string {
    return this.options.shared ?? this.options.directory;
  }

  /**
   * Reads every update Telegram holds and files each of the operator's
   * messages in a topic under that topic, whichever profile's work it is: the
   * reader is one per bot, the topics are each profile's. The offset moves
   * only once what it confirms is on disk, and a message filed twice is
   * filed once.
   */
  private async fileUpdates(): Promise<void> {
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
        if (message && this.isOperatorAnswer(message)) this.file(message.message_thread_id!, message);
      }
      writeJson(path.join(this.shared(), "offset.json"), {
        offset: Math.max(...updates.map((update) => update.update_id)) + 1,
        receivedAt: Date.now(),
      });
    }
  }

  /**
   * The offset to confirm with, unless it has outlived Telegram's update
   * ids: then the earliest update Telegram still holds is asked for instead,
   * and the ones already filed are filed once.
   */
  private offset(): number | undefined {
    const stored = readJson<{ offset?: number; receivedAt?: number }>(path.join(this.shared(), "offset.json"));
    if (stored?.offset === undefined) return undefined;
    if (stored.receivedAt === undefined || Date.now() - stored.receivedAt > OFFSET_LIFETIME_MS) return undefined;
    return stored.offset;
  }

  /**
   * By who wrote it and where, never by a marker in the text, and only when
   * it says something: a topic renamed, a sticker or a voice note carries no
   * answer, and an empty reply would read as one.
   */
  private isOperatorAnswer(message: TelegramMessage): boolean {
    if (message.from?.is_bot) return false;
    if (String(message.from?.id) !== this.options.operator) return false;
    if (String(message.chat.id) !== this.options.operator) return false;
    if (message.is_topic_message !== true || message.message_thread_id === undefined) return false;
    return Boolean(message.text?.trim() || message.caption?.trim() || message.document || message.photo?.length);
  }

  /**
   * Files one message under its topic, once. Telegram says when to the
   * second; a reply is placed at the end of its second, and after the last
   * one filed, so replies keep their order and none falls before a question
   * asked earlier in the same second. The whole inbox is rewritten aside and
   * renamed, so a reader never meets half a line.
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
    const inbox = path.join(this.shared(), "inbox");
    privateDirectory(inbox);
    writeText(path.join(inbox, `${topic}.jsonl`), [...filed, entry].map((one) => `${JSON.stringify(one)}\n`).join(""));
  }

  /** What is filed under a topic. A line that does not parse is skipped: its update was never confirmed, so it is filed again. */
  private filed(topic: number): Filed[] {
    const file = path.join(this.shared(), "inbox", `${topic}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line) as Filed];
      } catch {
        return [];
      }
    });
  }

  /** The files as local paths, and a line naming each one too large to fetch. */
  private async downloadAll(topic: number, files: Filed["files"]): Promise<{ paths: string[]; skipped: string[] }> {
    const limit = this.options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const paths: string[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const target = path.join(this.shared(), "files", String(topic), safeName(file.unique), safeName(file.name));
      const kept = (file.size ?? 0) <= limit && (fs.existsSync(target) || (await this.download(file.id, target, limit)));
      if (kept) paths.push(target);
      else skipped.push(`[${file.name} was not downloaded: it is larger than ${limit} bytes]`);
    }
    return { paths, skipped };
  }

  /**
   * Fetches one file to its place, or answers false when it is too large:
   * by what getFile says, by Telegram refusing it as too big when the
   * message did not say its size, or by its bytes as they arrive.
   */
  private async download(fileId: string, target: string, limit: number): Promise<boolean> {
    let found: { file_path?: string; file_size?: number };
    try {
      found = await this.api.call("getFile", { file_id: fileId });
    } catch (error) {
      if (error instanceof BotApiRefusal && /file is too big/i.test(error.description)) return false;
      throw error;
    }
    if ((found.file_size ?? 0) > limit || !found.file_path) return false;
    let bytes: Uint8Array;
    try {
      bytes = await this.api.download(found.file_path, limit);
    } catch (error) {
      if (error instanceof TooLarge) return false;
      throw error;
    }
    privateDirectory(path.dirname(target));
    // Staged and renamed, so a path that exists is always a whole file.
    const partial = `${target}.${randomUUID()}.partial`;
    fs.writeFileSync(partial, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(partial, target);
    return true;
  }

  private topics(): Record<string, number> {
    return readJson<Record<string, number>>(path.join(this.options.directory, "topics.json")) ?? {};
  }

  /**
   * Runs `work` holding the bot's shared directory: one process reads its
   * updates or opens a topic at a time. The hold is renewed while the work
   * runs, so a slow call or a flood wait is not mistaken for a dead holder; a
   * hold not renewed within its lease is taken over, and a holder releases
   * only a hold that is still its own.
   */
  private async held<T>(work: () => Promise<T>): Promise<T> {
    const lock = path.join(this.shared(), "lock");
    const lease = this.options.leaseMs ?? 60_000;
    const deadline = Date.now() + (this.options.lockWaitMs ?? 120_000);
    const me = randomUUID();
    while (!claim(lock, me)) {
      const since = mtimeOf(lock);
      if (since !== undefined && Date.now() - since > lease) {
        // Moved aside first, so of two processes taking it over one wins.
        ignoringGone(() => fs.renameSync(lock, `${lock}.${randomUUID()}.stale`));
        removeStale(this.shared());
        continue;
      }
      if (Date.now() > deadline) throw new Error(`${this.shared()} is held by another process; waited for it and gave up`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const renew = setInterval(() => ignoringGone(() => ownedBy(lock, me) && fs.utimesSync(lock, new Date(), new Date())), Math.max(10, lease / 3));
    try {
      return await work();
    } finally {
      clearInterval(renew);
      if (ownedBy(lock, me)) fs.rmSync(lock, { recursive: true, force: true });
    }
  }
}

/** A work's topic, read as the map's own entry: a work id such as `constructor` is not the map's prototype. */
function topicFor(topics: Record<string, number>, workId: string): number | undefined {
  return Object.hasOwn(topics, workId) ? topics[workId] : undefined;
}

/** Takes the lock if nobody holds it, writing who holds it inside. */
function claim(lock: string, me: string): boolean {
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  fs.writeFileSync(path.join(lock, "owner"), me, { mode: 0o600 });
  return true;
}

function ownedBy(lock: string, me: string): boolean {
  try {
    return fs.readFileSync(path.join(lock, "owner"), "utf-8") === me;
  } catch {
    return false;
  }
}

/** Removes the holds taken over and moved aside. */
function removeStale(directory: string): void {
  for (const name of fs.readdirSync(directory)) {
    if (name.endsWith(".stale")) fs.rmSync(path.join(directory, name), { recursive: true, force: true });
  }
}

function ignoringGone(act: () => unknown): void {
  try {
    act();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function readJson<T>(file: string): T | undefined {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as T) : undefined;
}

function writeJson(file: string, value: unknown): void {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Written aside and renamed, so a reader never sees half of it. */
function writeText(file: string, text: string): void {
  const partial = `${file}.${randomUUID()}.partial`;
  fs.writeFileSync(partial, text, { mode: 0o600 });
  fs.renameSync(partial, file);
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
