// Telegram's Bot API for one bot, answered from memory, held to the vendored
// contract both ways: every call amy makes is checked against the method's
// parameters, and every answer this gives against the type the method
// returns, so the stand-in cannot drift from what Telegram documents.
import { writeFileSync } from "node:fs";
import { assertValidBotApiCall, assertValidBotApiResult } from "@amykit/test-fixtures";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/index.js";

export const TOKEN = "123456:stand-in-token";
const BOT_ID = 900;
export const OPERATOR = 4021;
export const SOMEBODY_ELSE = 5022;

interface File {
  id: string;
  unique: string;
  bytes: Uint8Array;
  /** What getFile reports, which may differ from the bytes on purpose. */
  size: number;
}

type Message = Record<string, unknown> & { message_id: number };

export interface StandInOptions {
  topicsEnabled?: boolean;
  /** Whether the operator ever pressed Start in the bot's chat. */
  started?: boolean;
  /** Something else reads this bot's updates: getUpdates answers 409. */
  polledElsewhere?: boolean;
  /** getFile refuses a file larger than this, as Telegram refuses one past 20 MB. */
  largestFile?: number;
  /** getFile answers with no file_path, which the Bot API allows. */
  noFilePath?: boolean;
  /** A local Bot API server: getFile answers an absolute path under this directory. */
  localFiles?: string;
  /** The local server's file is not where it says, as on a disk amy does not share. */
  localFilesElsewhere?: boolean;
}

/**
 * The bot, the operator's private chat with it, and the updates Telegram
 * holds until they are confirmed.
 */
export function botApiStandIn(options: StandInOptions = {}) {
  const topics = new Map<number, string>();
  const sent: { topic: number; text: string }[] = [];
  const updates: { update_id: number; message: Message }[] = [];
  const files = new Map<string, File>();
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  let confirmed = 0;
  let nextUpdate = 70_000;
  let nextMessage = 1;
  let nextTopic = 11;
  // Telegram stamps a message with its own clock, which is the machine's.
  let clock = Math.floor(Date.now() / 1000);

  const user = (id: number, isBot = false) => ({ id, is_bot: isBot, first_name: isBot ? "amy" : id === OPERATOR ? "Ada" : "Grace" });
  const chat = (id: number) => ({ id, type: "private", first_name: id === OPERATOR ? "Ada" : "Grace" });
  const refuse = (status: number, description: string) => ({ status, description });

  const started = (args: Record<string, unknown>) => Number(args.chat_id) === OPERATOR && options.started !== false;
  const methods: Record<string, (args: Record<string, unknown>) => unknown> = {
    getMe: () => ({ ...user(BOT_ID, true), username: "amy_work_bot", ...(options.topicsEnabled === false ? {} : { has_topics_enabled: true }) }),
    getChat: (args) => started(args)
      ? {
          ...chat(OPERATOR),
          accent_color_id: 0,
          max_reaction_count: 11,
          accepted_gift_types: { unlimited_gifts: true, limited_gifts: true, unique_gifts: true, premium_subscription: true, gifts_from_channels: true },
        }
      : refuse(400, "Bad Request: chat not found"),
    createForumTopic: (args) => {
      if (options.topicsEnabled === false) return refuse(400, "Bad Request: the chat is not a forum");
      if (!started(args) && Number(args.chat_id) !== SOMEBODY_ELSE) return refuse(400, "Bad Request: chat not found");
      const id = nextTopic++;
      topics.set(id, String(args.name));
      return { message_thread_id: id, name: String(args.name), icon_color: 7322096 };
    },
    sendMessage: (args) => {
      const topic = Number(args.message_thread_id);
      if (!topics.has(topic)) return refuse(400, "Bad Request: message thread not found");
      sent.push({ topic, text: String(args.text) });
      return { message_id: nextMessage++, message_thread_id: topic, is_topic_message: true, from: user(BOT_ID, true), chat: chat(OPERATOR), date: clock, text: String(args.text) };
    },
    getUpdates: (args) => {
      if (options.polledElsewhere) return refuse(409, "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running");
      if (typeof args.offset === "number") confirmed = Math.max(confirmed, args.offset);
      const limit = typeof args.limit === "number" ? args.limit : 100;
      return updates.filter((update) => update.update_id >= confirmed).slice(0, limit);
    },
    getFile: (args) => {
      const file = files.get(String(args.file_id));
      if (!file) return refuse(400, "Bad Request: invalid file_id");
      if (options.largestFile !== undefined && file.size > options.largestFile) return refuse(400, "Bad Request: file is too big");
      if (options.noFilePath) return { file_id: file.id, file_unique_id: file.unique, file_size: file.size };
      if (options.localFiles) {
        const local = `${options.localFiles}/${file.unique}`;
        if (!options.localFilesElsewhere) writeFileSync(local, file.bytes);
        return { file_id: file.id, file_unique_id: file.unique, file_size: file.size, file_path: local };
      }
      return { file_id: file.id, file_unique_id: file.unique, file_size: file.size, file_path: `documents/${file.unique}` };
    },
  };

  function answer(method: string, args: Record<string, unknown>): unknown {
    const handler = methods[method];
    if (!handler) throw new Error(`the stand-in Bot API has no ${method}`);
    return handler(args);
  }


  const reply = (status: number, body: unknown): HttpResponse => ({ status, body: new TextEncoder().encode(JSON.stringify(body)) });

  const transport: HttpTransport = async (request: HttpRequest) => {
    const url = new URL(request.url);
    const download = /^\/file\/bot([^/]+)\/documents\/(.+)$/.exec(url.pathname);
    if (download) {
      if (![TOKEN].includes(download[1]!)) return reply(401, { ok: false, error_code: 401, description: "Unauthorized" });
      const file = [...files.values()].find((one) => one.unique === download[2]);
      return file ? { status: 200, body: file.bytes } : reply(404, { ok: false, error_code: 404, description: "Not Found" });
    }
    const called = /^\/bot([^/]+)\/(\w+)$/.exec(url.pathname);
    if (!called) throw new Error(`the stand-in Bot API has no route ${url.pathname}`);
    if (![TOKEN].includes(called[1]!)) return reply(401, { ok: false, error_code: 401, description: "Unauthorized" });
    const method = called[2]!;
    const args = request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
    assertValidBotApiCall(method, args);
    calls.push({ method, args });
    const result = answer(method, args);
    if (result && typeof result === "object" && "status" in result && "description" in result) {
      const refusal = result as { status: number; description: string };
      return reply(refusal.status, { ok: false, error_code: refusal.status, description: refusal.description });
    }
    assertValidBotApiResult(method, result);
    return reply(200, { ok: true, result });
  };

  /** Somebody writes in the operator's chat with the bot: in a topic, or outside every one. */
  function say(
    text: string,
    where: { topic?: number; from?: number; file?: { name: string; bytes: Uint8Array; size?: number; unsized?: boolean }; photo?: boolean; renamesTopic?: boolean } = {},
  ): Message {
    clock = Math.max(clock + 1, Math.floor(Date.now() / 1000));
    const from = where.from ?? OPERATOR;
    const message: Message = {
      message_id: nextMessage++,
      from: user(from),
      chat: chat(from),
      date: clock,
      ...(where.topic === undefined ? {} : { message_thread_id: where.topic, is_topic_message: true }),
      ...(where.file || where.renamesTopic ? {} : { text }),
      // A service message: the topic renamed, which says nothing.
      ...(where.renamesTopic ? { forum_topic_edited: { name: text } } : {}),
    };
    if (where.file) {
      const unique = `u${nextMessage}`;
      const file: File = { id: `f${nextMessage}`, unique, bytes: where.file.bytes, size: where.file.size ?? where.file.bytes.byteLength };
      files.set(file.id, file);
      message.caption = text;
      if (where.photo) {
        // A thumbnail too, listed first and with no byte count, as Telegram may send them.
        const thumb: File = { id: `t${nextMessage}`, unique: `t${unique}`, bytes: new Uint8Array([0]), size: 1 };
        files.set(thumb.id, thumb);
        message.photo = [
          { file_id: thumb.id, file_unique_id: thumb.unique, width: 90, height: 67 },
          { file_id: file.id, file_unique_id: unique, width: 640, height: 480 },
        ];
      }
      else message.document = { file_id: file.id, file_unique_id: unique, file_name: where.file.name, ...(where.file.unsized ? {} : { file_size: file.size }) };
    }
    updates.push({ update_id: nextUpdate++, message });
    return message;
  }

  /** Telegram restarts its update ids, as it does after a week with none. */
  function restartUpdateIds(from: number): void {
    nextUpdate = from;
    confirmed = 0;
  }

  return {
    transport,
    restartUpdateIds,
    say,
    topics,
    sent,
    calls,
    /** Updates Telegram still holds, unconfirmed. */
    pending: () => updates.filter((update) => update.update_id >= confirmed).length,
    /** The clock Telegram stamps messages with, in seconds. */
    now: () => clock,
    options,
  };
}

export type BotApiStandIn = ReturnType<typeof botApiStandIn>;
