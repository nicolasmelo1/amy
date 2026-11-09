import fs from "node:fs";
import path from "node:path";

const world = globalThis.process.env.AMY_E2E_WORLD;
const stateFile = world && path.join(world, "slack.json");
const bot = "U0AMYBOT";
const scope = "chat:write,reactions:write,reactions:read,channels:read,channels:history,files:read";
const read = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const write = (state) => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
const response = (body, headers = {}) => new globalThis.Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { "content-type": "application/json", ...headers } });
const form = async (init) => Object.fromEntries(new globalThis.URLSearchParams(typeof init?.body === "string" ? init.body : ""));
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const match = /^https:\/\/slack\.com\/api\/([\w.]+)$/.exec(String(input));
  if (!match || !stateFile) return original(input, init);
  const method = match[1];
  const args = await form(init);
  const state = read();
  if (method === "auth.test") return response({ url: "https://workshop.slack.test/", team: "Workshop", user: "amy", team_id: "T0WORK", user_id: bot }, { "x-oauth-scopes": scope });
  if (method === "chat.postMessage") {
    const nextTs = Math.max(state.nextTs, Math.floor(Date.now() / 1000));
    const ts = `${nextTs}.000100`;
    state.nextTs = nextTs + 1;
    state.messages.push({ ts, channel: args.channel, thread_ts: args.thread_ts, user: bot, bot_id: "B0AMY", text: args.text ?? "", ...(args.metadata ? { metadata: JSON.parse(args.metadata) } : {}), reactions: [] });
    write(state);
    return response({ channel: args.channel, ts, message: { type: "message", text: args.text ?? "", ts } });
  }
  if (method === "reactions.add") {
    const message = state.messages.find((entry) => entry.ts === args.timestamp);
    if (!message) return response({ ok: false, error: "message_not_found" });
    const reaction = message.reactions.find((entry) => entry.name === args.name) ?? { name: args.name, users: [], count: 0 };
    if (!message.reactions.includes(reaction)) message.reactions.push(reaction);
    if (!reaction.users.includes(bot)) reaction.users.push(bot);
    reaction.count = reaction.users.length;
    write(state);
    return response({});
  }
  if (method === "conversations.replies") {
    // As Slack: a message at exactly `oldest` is left out unless asked for.
    const oldest = Number(args.oldest ?? "0");
    const after = (ts) => (args.inclusive === "true" ? Number(ts) >= oldest : Number(ts) > oldest);
    const messages = state.messages.filter((message) => message.channel === args.channel && message.thread_ts === args.ts && after(message.ts));
    return response({ messages, has_more: false });
  }
  if (method === "conversations.info") return response({ channel: { name: "work", is_private: false, is_member: true } });
  if (method === "reactions.get") { const message = state.messages.find((entry) => entry.ts === args.timestamp); return response({ message: { reactions: message?.reactions ?? [] } }); }
  return response({ ok: false, error: `unhandled_${method}` });
};
