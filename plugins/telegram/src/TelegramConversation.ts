import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Conversation, Reply, ThreadRef } from "@amykit/core";
import { BotApi, BotApiRefusal, TooLarge } from "./BotApi.js";

export interface TelegramConversationOptions {
  /** The operator's user id, which is also their private chat with the bot. */
  operator: string;
  /**
   * What this profile owns: its topics by work id, the replies filed under
   * them and the files they carried. Removing the profile removes all of it.
   */
  directory: string;
  /**
   * What one bot shares across profiles: which profile owns each topic, the
   * update offset and the lock. The directory itself when not given.
   */
  shared?: string;
  /** The largest file downloaded; a larger one is named in the reply instead. */
  maxFileBytes?: number;
  /** How long to wait for another process reading the bot. */
  lockWaitMs?: number;
  /** How long a hold on the bot lasts without being renewed. */
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

/**
 * Telegram restarts its update ids at random after a week without updates, so
 * an offset older than this is not sent: it could confirm, unread, the new
 * updates numbered below it.
 */
const OFFSET_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;

/** An opening, and what was kept for it, left this long is abandoned. */
const ABANDONED_MS = 24 * 60 * 60 * 1000;

/** Who owns a topic: its profile's directory, relative to the bot's, and that directory's identity. */
interface Owner {
  directory: string;
  identity: string;
}

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

interface TelegramPhotoSize extends TelegramFileRef {
  width: number;
  height: number;
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
  photo?: TelegramPhotoSize[];
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
  /** What the operator marked it as, by a command at its start. */
  kind?: "decision" | "discussion";
}

/**
 * One topic per piece of work, in the operator's private chat with the bot.
 *
 * Telegram hands a bot its updates once, to whoever asks first, so the
 * process reading them files each message, durably, under the profile that
 * owns its topic before the offset that confirms it moves.
 *
 * Nothing here depends on that reader being alone. Every reply is a file of
 * its own, created and never rewritten; every topic and owner is a file
 * created once; the offset only moves forward. A second reader, or one that
 * was paused past its hold, can only add what is already there, never lose
 * it. The hold on the bot saves work (a 409 from Telegram, a topic opened
 * twice) and nothing else.
 */
export class TelegramConversation implements Conversation {
  private readonly opening = new Map<string, Promise<ThreadRef>>();
  /** Who this profile's directory is: a directory removed and made again is somebody else. */
  private readonly identity: string;
  /** The operator's id as Telegram writes it, whatever spelling the config used. */
  private readonly operator: string;

  constructor(
    private readonly api: BotApi,
    private readonly options: TelegramConversationOptions,
  ) {
    privateDirectory(options.directory);
    privateDirectory(this.shared());
    this.operator = normalisedId(options.operator);
    this.identity = identityOf(options.directory);
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    const known = this.topicOfWork(workId);
    if (known !== undefined) {
      // An opener that stopped between recording the topic and adopting its early replies left them waiting.
      this.adopt(`${this.chat()}-${known}`);
      return Promise.resolve({ id: String(known) });
    }
    // Two looks at the same work in one process must not open two topics.
    const pending = this.opening.get(workId);
    if (pending) return pending;
    const opened = this.held(async () => {
      // Another process may have opened it while this one waited.
      const already = this.topicOfWork(workId);
      if (already !== undefined) return { id: String(already) };
      // Said before asking, so a reply in a topic Telegram creates now is kept until its owner is recorded.
      const opening = path.join(this.shared(), "opening", String(this.chat()), `${randomUUID()}.json`);
      createOnce(opening, { workId }, this.shared());
      let topic: { message_thread_id: number };
      try {
        topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
          chat_id: this.chat(),
          name: topicName(title, workId),
        });
      } catch (error) {
        closeOpening(opening);
        throw error;
      }
      // Owner first: a reply that arrives before the work knows its topic is still filed here.
      // The directory is kept relative to the bot's, so a state root moved or mounted elsewhere still finds it.
      // A profile removed while Telegram was answering is not made again, and owns nothing.
      if (readIdentity(this.options.directory) !== this.identity) {
        throw new Error(`${this.options.directory} was removed while its topic was being opened`);
      }
      const owner: Owner = { directory: path.relative(this.shared(), this.options.directory), identity: this.identity };
      const key = `${this.chat()}-${topic.message_thread_id}`;
      createOnce(path.join(this.shared(), "owners", `${key}.json`), owner, this.shared());
      // Created once: if another process recorded a topic for this work first, that one is the work's.
      createOnce(path.join(this.options.directory, "topics", `${fileNameOf(workId)}.json`), { topic: topic.message_thread_id }, this.options.directory);
      this.adopt(key);
      closeOpening(opening);
      return { id: String(this.topicOfWork(workId)) };
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
    const after = instantToMicros(since);
    if (Number.isNaN(after)) throw new Error(`replies since ${since}: not an instant`);
    const topic = topicOf(thread);
    await this.held(async () => {
      this.adopt(`${this.chat()}-${topic}`);
      await this.fileUpdates();
    });

    const replies: Reply[] = [];
    for (const filed of filedUnder(this.inbox(this.options.directory, this.identity, topic))) {
      if (instantToMicros(filed.at) <= after) continue;
      const { paths, skipped } = await this.downloadAll(topic, filed.files);
      replies.push({ at: filed.at, author: filed.author, text: [filed.text, ...skipped].filter(Boolean).join("\n"), files: paths, ...(filed.kind ? { kind: filed.kind } : {}) });
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
        ? { label: "telegram chat", ok: true, detail: `private chat with ${this.operator}` }
        : { label: "telegram chat", ok: false, detail: `${this.operator} is a ${chat.type ?? "chat"}, not a person; set operator to your own user id` });
    } catch (error) {
      checks.push({ label: "telegram chat", ok: false, detail: `${this.operator} has no chat with ${name}; open ${name} in Telegram and send /start (${messageOf(error)})` });
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
    return Number(this.operator);
  }

  private shared(): string {
    return this.options.shared ?? this.options.directory;
  }

  private inbox(directory: string, identity: string, topic: number): string {
    return path.join(directory, `inbox-${identity}`, String(topic));
  }

  /**
   * Reads every update Telegram holds and files each of the operator's
   * messages under the profile owning its topic. A topic no profile owns any
   * more, its profile removed or made again, is skipped. The offset moves
   * only once what it confirms is durably on disk.
   */
  private async fileUpdates(): Promise<void> {
    this.pruneAbandoned();
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
        if (message && isAnAnswer(message)) this.file(message);
      }
      this.confirm(Math.max(...updates.map((update) => update.update_id)) + 1);
    }
  }

  /**
   * Files one message in its owner's inbox for that owner's identity, as a
   * file of its own. The inbox is named for the identity, so a write racing a
   * profile's removal lands where no later profile at that path reads.
   */
  private file(message: TelegramMessage): void {
    const topic = message.message_thread_id!;
    // Keyed by chat: one bot's topics in two operators' chats are two owners.
    const key = `${message.chat.id}-${topic}`;
    const ownerFile = path.join(this.shared(), "owners", `${key}.json`);
    let owner = readJson<Owner>(ownerFile);
    if (!owner) {
      // A topic being opened right now has no owner yet: kept until it has, never confirmed away.
      if (this.openingIn(message.chat.id)) {
        createOnce(path.join(this.shared(), "unowned", key, `${message.message_id}.json`), message, this.shared());
        return;
      }
      // No opening now, but one may have finished since the owner was looked up: its owner says so.
      owner = readJson<Owner>(ownerFile);
      // Anything else in a chat nobody is opening a topic in is nobody's, and is not kept.
      if (!owner) return;
    }
    const place = this.inboxOf(owner, topic);
    if (!place || filedAlready(place.inbox, message.message_id)) return;
    const { directory, inbox } = place;
    const { kind, text } = markedBy(message.text ?? message.caption ?? "");
    const filed: Filed = { messageId: message.message_id, at: instantOf(message), author: String(message.from!.id), text, files: filesOf(message), ...(kind ? { kind } : {}) };
    // Created once: a late reader filing the same message finds it there. Only when the file that is
    // there does not parse, somebody having damaged it, is the reply filed beside it; nothing is deleted.
    const target = path.join(inbox, `${message.message_id}.json`);
    if (!createOnce(target, filed, directory) && readJson<Filed>(target, true) === undefined) {
      createOnce(path.join(inbox, `${message.message_id}-again.json`), filed, directory);
    }
  }

  /**
   * Where a topic's replies are filed for its owner, if that owner's directory
   * still carries the identity that opened the topic; made if needed.
   */
  private inboxOf(owner: Owner, topic: number): { directory: string; inbox: string } | undefined {
    const directory = path.resolve(this.shared(), owner.directory);
    if (readIdentity(directory) !== owner.identity) return undefined;
    const inbox = this.inbox(directory, owner.identity, topic);
    return ensureInbox(directory, inbox) ? { directory, inbox } : undefined;
  }

  /** Files what arrived in a topic before its owner was recorded, now that it is. */
  private adopt(key: string): void {
    const waiting = path.join(this.shared(), "unowned", key);
    let names: string[];
    try {
      names = fs.readdirSync(waiting).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    // In the order the operator wrote them, which a directory listing does not promise.
    for (const name of names.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))) {
      const message = readJson<TelegramMessage>(path.join(waiting, name), true);
      if (message) this.file(message);
      fs.rmSync(path.join(waiting, name), { force: true });
    }
  }

  /** Whether a topic is being opened in this chat now, by any process: an opening older than a day was abandoned. */
  private openingIn(chat: number): boolean {
    const openings = path.join(this.shared(), "opening", String(chat));
    let names: string[];
    try {
      names = fs.readdirSync(openings);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    return names.some((name) => {
      const since = mtimeOf(path.join(openings, name));
      return since !== undefined && Date.now() - since < ABANDONED_MS;
    });
  }

  /** Replies kept for a topic whose opening was abandoned a day ago, and the openings themselves, go. */
  private pruneAbandoned(): void {
    for (const area of ["unowned", "opening"]) {
      const root = path.join(this.shared(), area);
      let entries: string[];
      try {
        entries = fs.readdirSync(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      for (const entry of entries) {
        const directory = path.join(root, entry);
        const newest = Math.max(0, ...fs.readdirSync(directory).map((name) => mtimeOf(path.join(directory, name)) ?? 0));
        const owned = area === "unowned" && fs.existsSync(path.join(this.shared(), "owners", `${entry}.json`));
        if (!owned && Date.now() - newest > ABANDONED_MS) fs.rmSync(directory, { recursive: true, force: true });
      }
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

  /** Moves the offset forward, never back, so a late reader cannot unconfirm what another confirmed. */
  private confirm(next: number): void {
    const file = path.join(this.shared(), "offset.json");
    const stored = readJson<{ offset?: number; receivedAt?: number }>(file);
    const expired = stored?.receivedAt === undefined || Date.now() - stored.receivedAt > OFFSET_LIFETIME_MS;
    if (!expired && (stored?.offset ?? 0) > next) return;
    writeJson(file, { offset: next, receivedAt: Date.now() });
  }


  /** The files as local paths, and a line naming each one too large to fetch. */
  private async downloadAll(topic: number, files: Filed["files"]): Promise<{ paths: string[]; skipped: string[] }> {
    const limit = this.options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const paths: string[] = [];
    const skipped: string[] = [];
    for (const one of files) {
      const target = path.join(this.options.directory, "files", String(topic), safeName(one.unique), safeName(one.name));
      const kept = (one.size ?? 0) <= limit && (fs.existsSync(target) || (await this.download(one, target, limit)));
      if (kept) paths.push(target);
      else skipped.push(`[${one.name} was not downloaded: it is larger than ${limit} bytes]`);
    }
    return { paths, skipped };
  }

  /**
   * Fetches one file to its place, or answers false when it is too large: by
   * what getFile says, by Telegram refusing it as too big when the message did
   * not say its size, or by its bytes as they arrive. A local Bot API server
   * answers with a path on its own disk, which is read where it lies.
   */
  private async download(one: Filed["files"][number], target: string, limit: number): Promise<boolean> {
    let found: { file_path?: string; file_size?: number };
    try {
      found = await this.api.call("getFile", { file_id: one.id });
    } catch (error) {
      if (error instanceof BotApiRefusal && /file is too big/i.test(error.description)) return false;
      throw error;
    }
    if ((found.file_size ?? 0) > limit) return false;
    if (!found.file_path) throw new Error(`telegram gave no path to download ${one.name}; it is asked for again on the next look`);
    let bytes: Uint8Array;
    try {
      bytes = path.isAbsolute(found.file_path) ? localFile(found.file_path, limit) : await this.api.download(found.file_path, limit);
    } catch (error) {
      if (error instanceof TooLarge) return false;
      throw error;
    }
    // Within the profile's own directory, which is not made again if it was removed meanwhile.
    if (readIdentity(this.options.directory) !== this.identity) throw new Error(`${this.options.directory} was removed while its file was being fetched`);
    durableDirectory(path.dirname(target), this.options.directory);
    // Staged under a short name of its own and renamed, so a path that exists is always a whole file.
    const partial = path.join(path.dirname(target), `.${randomUUID()}.partial`);
    fs.writeFileSync(partial, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(partial, target);
    return true;
  }

  private topicOfWork(workId: string): number | undefined {
    return readJson<{ topic: number }>(path.join(this.options.directory, "topics", `${fileNameOf(workId)}.json`))?.topic;
  }

  /**
   * Runs `work` holding the bot, so one process reads its updates or opens a
   * topic at a time: a hold not renewed within its lease is taken over. Being
   * passed over costs a 409 or a second topic, never a reply, since nothing
   * filed is ever rewritten.
   */
  private async held<T>(work: () => Promise<T>): Promise<T> {
    const lock = path.join(this.shared(), "lock");
    const lease = this.options.leaseMs ?? 60_000;
    const deadline = Date.now() + (this.options.lockWaitMs ?? 120_000);
    const me = randomUUID();
    while (!claim(lock, me)) {
      const since = mtimeOf(lock);
      if (since !== undefined && Date.now() - since > lease) {
        ignoringGone(() => fs.renameSync(lock, path.join(this.shared(), `.${randomUUID()}.stale`)));
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

/**
 * A message that answers: written by the person whose private chat it is (a
 * bot's own messages excluded), in a topic, and saying something. A topic
 * renamed, a sticker or a voice note carries no answer, and an empty reply
 * would read as one. Whose topic it is the owners decide, by chat.
 */
function isAnAnswer(message: TelegramMessage): boolean {
  if (message.from?.is_bot) return false;
  if (message.chat.type !== "private" || message.from?.id !== message.chat.id) return false;
  if (message.is_topic_message !== true || message.message_thread_id === undefined) return false;
  return Boolean(message.text?.trim() || message.caption?.trim() || message.document || message.photo?.length);
}

/** Takes the hold if nobody has it, writing who holds it inside. */
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

/** The files a message carries: its document, and its photo at the largest size on screen, which every size states. */
function filesOf(message: TelegramMessage): Filed["files"] {
  const largest = message.photo?.length ? [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0] : undefined;
  return [
    ...(message.document ? [{ id: message.document.file_id, unique: message.document.file_unique_id, name: message.document.file_name ?? message.document.file_unique_id, size: message.document.file_size }] : []),
    ...(largest ? [{ id: largest.file_id, unique: largest.file_unique_id, name: `${largest.file_unique_id}.jpg`, size: largest.file_size }] : []),
  ];
}

/**
 * When a reply was written, to the microsecond, from what Telegram says: the
 * end of its second, so none falls before a question asked earlier in that
 * second, and then its message id, so two replies in one second keep the
 * order they were written in. Derived from the message alone, so any reader,
 * at any time, files it with the same instant.
 */
function instantOf(message: TelegramMessage): string {
  const end = new Date(message.date * 1000 + 999).toISOString();
  return end.replace(/Z$/, `${String(1 + (message.message_id % 999)).padStart(3, "0")}Z`);
}

/** An instant to the microsecond: the digits past the millisecond are read too. */
function instantToMicros(instant: string): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return Number.NaN;
  const extra = /\.\d{3}(\d{1,3})Z$/.exec(instant)?.[1] ?? "";
  return ms * 1000 + Number(extra.padEnd(3, "0"));
}

/** An opening done with, and the directories it leaves empty; one still in use by another opening stays. */
function closeOpening(opening: string): void {
  fs.rmSync(opening, { force: true });
  for (const directory of [path.dirname(opening), path.dirname(path.dirname(opening))]) {
    try {
      fs.rmdirSync(directory);
    } catch {
      return;
    }
  }
}

/** Whether a message is filed under the topic already, readably. */
function filedAlready(inbox: string, messageId: number): boolean {
  return [`${messageId}.json`, `${messageId}-again.json`].some((name) => readJson<Filed>(path.join(inbox, name), true) !== undefined);
}

/**
 * What the operator marked a reply as, by a command at its start, taken off
 * the text: /decide (or ✅) is the decision that moves the work, /discuss (or
 * 💬) a turn in a discussion. Unmarked, it carries no kind, and the
 * workflow's policy reads it.
 */
function markedBy(text: string): { kind?: "decision" | "discussion"; text: string } {
  const trimmed = text.trimStart();
  const marks: [string, "decision" | "discussion"][] = [["/decide", "decision"], ["✅", "decision"], ["/discuss", "discussion"], ["💬", "discussion"]];
  for (const [mark, kind] of marks) {
    if (!trimmed.startsWith(mark)) continue;
    let rest = trimmed.slice(mark.length);
    // A command may be addressed to the bot by name: /decide@amy_work_bot.
    if (mark.startsWith("/") && rest.startsWith("@")) rest = rest.slice(rest.search(/\s|$/));
    if (rest !== "" && !/^\s/.test(rest)) continue;
    return { kind, text: rest.trim() };
  }
  return { text };
}

/** Every reply filed under a topic, in order. A file that does not parse is skipped, and filed again. */
function filedUnder(inbox: string): Filed[] {
  let names: string[];
  try {
    names = fs.readdirSync(inbox).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .flatMap((name) => {
      const filed = readJson<Filed>(path.join(inbox, name), true);
      return filed ? [filed] : [];
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.messageId - b.messageId);
}

/**
 * The topic's inbox, made if needed without making anything above it: a
 * profile removed between the reader's look and this is not made again. Each
 * new directory is flushed into its parent before anything is filed in it.
 */
function ensureInbox(directory: string, inbox: string): boolean {
  for (const step of [path.dirname(inbox), inbox]) {
    try {
      fs.mkdirSync(step, { mode: 0o700 });
      syncDirectory(path.dirname(step));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") continue;
      if (code === "ENOENT") return false;
      throw error;
    }
  }
  return fs.existsSync(directory);
}


/** The identity a profile directory carries, published whole and durable the first time it is used. */
function identityOf(directory: string): string {
  const known = readIdentity(directory);
  if (known) return known;
  const made = randomUUID();
  const staged = path.join(directory, `.${randomUUID()}.partial`);
  const handle = fs.openSync(staged, "wx", 0o600);
  try {
    fs.writeFileSync(handle, made);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  try {
    // A link is created whole or not at all, so nobody reads half an identity.
    fs.linkSync(staged, path.join(directory, "identity"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(staged, { force: true });
  }
  syncDirectory(directory);
  return readIdentity(directory)!;
}

/** The directory's identity, or undefined when it has none because it is gone; any other failure is raised. */
function readIdentity(directory: string): string | undefined {
  try {
    return fs.readFileSync(path.join(directory, "identity"), "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

/**
 * A JSON file written once: whoever writes it first is the answer. Every
 * directory made for it is flushed into its parent first, and none is made
 * at or above `within`, which must already exist.
 */
function createOnce(file: string, value: unknown, within: string): boolean {
  durableDirectory(path.dirname(file), within);
  const staged = path.join(path.dirname(file), `.${randomUUID()}.partial`);
  const handle = fs.openSync(staged, "wx", 0o600);
  try {
    fs.writeFileSync(handle, `${JSON.stringify(value)}\n`);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  let published = true;
  try {
    fs.linkSync(staged, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    published = false;
  } finally {
    fs.rmSync(staged, { force: true });
  }
  syncDirectory(path.dirname(file));
  return published;
}

/**
 * A file a local Bot API server keeps on a disk amy shares, read within the
 * limit. Its path is never said: a local server may put the token in it.
 */
function localFile(file: string, limit: number): Uint8Array {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    throw new Error("the local Bot API server keeps this file where amy cannot read it; the server and amy must share that disk");
  }
  if (size > limit) throw new TooLarge(limit);
  try {
    return fs.readFileSync(file);
  } catch {
    throw new Error("the local Bot API server's file could not be read; the server and amy must share that disk");
  }
}

/** A Telegram id spelled as Telegram spells it: 004021 is 4021. */
function normalisedId(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error(`${id} is not a Telegram user id`);
  return String(Number(id));
}

/**
 * A work id as one file name on every system: a lowercase digest of the
 * whole id, so `build` and `Build` stay two on a case-insensitive disk, no id
 * is too long, and none is a name Windows reserves.
 */
function fileNameOf(workId: string): string {
  return createHash("sha256").update(workId).digest("hex");
}

function topicOf(thread: ThreadRef): number {
  const topic = Number(thread.id);
  if (!Number.isInteger(topic)) throw new Error(`${thread.id} is not a telegram topic`);
  return topic;
}

/** The title, as much of it as a topic's name holds; the work id when there is none. */
function topicName(title: string, workId: string): string {
  const name = (title.trim() || workId).replace(/\s+/g, " ");
  return name.length > MAX_TOPIC_NAME_CHARS ? `${name.slice(0, whole(name, MAX_TOPIC_NAME_CHARS - 1))}…` : name;
}

/**
 * The text in messages Telegram accepts, split at a line where one falls in
 * reach, never inside a character, and never leaving an empty last part.
 */
function parts(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_CHARS) {
    const cut = rest.lastIndexOf("\n", MAX_MESSAGE_CHARS);
    const at = cut > MAX_MESSAGE_CHARS / 2 ? cut : whole(rest, MAX_MESSAGE_CHARS);
    out.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^\n/, "");
  }
  if (rest !== "" || out.length === 0) out.push(rest);
  return out;
}

/** The cut at `at`, moved back one if it would split a surrogate pair. */
function whole(text: string, at: number): number {
  const code = text.charCodeAt(at - 1);
  return code >= 0xd800 && code <= 0xdbff ? at - 1 : at;
}

function mtimeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

function ignoringGone(act: () => unknown): void {
  try {
    act();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** A JSON file's value; with `lenient`, a file that does not parse reads as absent. */
function readJson<T>(file: string, lenient = false): T | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (lenient) return undefined;
    throw error;
  }
}

function writeJson(file: string, value: unknown): void {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Written aside, flushed to the disk, renamed, and the rename flushed too: a
 * reader never sees half of it, and a crash after this returns loses none of
 * it, which is what lets the offset that follows confirm it to Telegram.
 */
function writeText(file: string, text: string): void {
  const partial = path.join(path.dirname(file), `.${randomUUID()}.partial`);
  const handle = fs.openSync(partial, "wx", 0o600);
  try {
    // Every byte or an error: a short write is not published.
    fs.writeFileSync(handle, text);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(partial, file);
  syncDirectory(path.dirname(file));
}

/** A directory's entries flushed; a platform that cannot open a directory for this keeps the rename as it is. */
function syncDirectory(directory: string): void {
  let handle: number | undefined;
  try {
    handle = fs.openSync(directory, "r");
    fs.fsyncSync(handle);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EISDIR" && code !== "EPERM" && code !== "EINVAL" && code !== "EBADF") throw error;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

/** A directory made, if it is not there, and flushed into its parent so it survives a power loss. */
function durableDirectory(directory: string, within: string): void {
  if (fs.existsSync(directory)) return;
  const relative = path.relative(within, directory);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${within} is gone, and nothing is made in its place`);
  }
  durableDirectory(path.dirname(directory), within);
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  syncDirectory(path.dirname(directory));
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
