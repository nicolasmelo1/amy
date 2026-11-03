// The stand-in Bot API, served over HTTP for the installed executable: the
// same in-memory Telegram the plugin's tests use, held to the vendored
// contract both ways, plus a door the operator writes through.
//
// Usage: tsx bot-api.ts <port-file>
//
//   POST /bot<token>/<method>        what amy calls, as Telegram answers it
//   GET  /file/bot<token>/<path>     a file's bytes
//   POST /operator/say               {text, topic?, from?}: somebody writes in the chat
//   GET  /operator/world             the topics, what amy sent, what Telegram still holds
import fs from "node:fs";
import http from "node:http";
import { botApiStandIn } from "../../../plugins/telegram/tests/stand-in.js";

const [portFile = ""] = process.argv.slice(2);
if (!portFile) throw new Error("usage: bot-api.ts <port-file>");

const telegram = botApiStandIn();
/** Every call or answer the contract refused: the run is red if there is one. */
const violations: string[] = [];

const server = http.createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    void (async () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const send = (status: number, payload: Uint8Array | string) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(payload);
      };
      try {
        if (request.url === "/operator/say") {
          const said = JSON.parse(body) as { text: string; topic?: number; from?: number };
          send(200, JSON.stringify(telegram.say(said.text, { ...(said.topic === undefined ? {} : { topic: said.topic }), ...(said.from === undefined ? {} : { from: said.from }) })));
          return;
        }
        if (request.url === "/operator/world") {
          send(200, JSON.stringify({ topics: Object.fromEntries(telegram.topics), sent: telegram.sent, pending: telegram.pending(), violations, calls: telegram.calls.map((call) => call.method) }));
          return;
        }
        const answered = await telegram.transport({ url: `http://stand-in${request.url}`, method: request.method === "GET" ? "GET" : "POST", headers: {}, ...(body ? { body } : {}) });
        send(answered.status, answered.body);
      } catch (error) {
        // A call outside the contract is the finding: said back as a refusal amy will surface.
        const said = error instanceof Error ? error.message : String(error);
        violations.push(said);
        send(400, JSON.stringify({ ok: false, error_code: 400, description: said }));
      }
    })();
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  fs.writeFileSync(portFile, String(typeof address === "object" && address ? address.port : ""));
});
