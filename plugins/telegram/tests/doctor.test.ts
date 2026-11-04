import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BotApi, TelegramConversation } from "../src/index.js";
import { OPERATOR, StandInOptions, TOKEN, botApiStandIn } from "./stand-in.js";

async function checksWith(options: StandInOptions) {
  const telegram = botApiStandIn(options);
  const amy = new TelegramConversation(new BotApi(TOKEN, { transport: telegram.transport }), {
    operator: String(OPERATOR),
    directory: fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-doctor-")),
  });
  return amy.checks();
}

describe("what amy doctor asks Telegram", () => {
  it("passes a bot with topics on, a chat the operator started, and updates nobody else reads", async () => {
    const checks = await checksWith({});

    expect(checks.map((check) => [check.label, check.ok])).toEqual([
      ["telegram bot", true],
      ["telegram chat", true],
      ["telegram updates", true],
    ]);
  });

  it("refuses a bot whose topic mode is off, by name", async () => {
    const [bot] = await checksWith({ topicsEnabled: false });

    expect(bot).toEqual({ label: "telegram bot", ok: false, detail: expect.stringMatching(/@amy_work_bot has topic mode off; turn on topics for it in @BotFather/) });
  });

  it("refuses an operator who never started a chat with the bot", async () => {
    const checks = await checksWith({ started: false });

    expect(checks.find((check) => check.label === "telegram chat")).toEqual({
      label: "telegram chat",
      ok: false,
      detail: expect.stringMatching(/4021 has no chat with @amy_work_bot; open @amy_work_bot in Telegram and send \/start/),
    });
  });

  it("refuses a token whose updates something else reads, from Telegram's 409", async () => {
    const checks = await checksWith({ polledElsewhere: true });

    expect(checks.find((check) => check.label === "telegram updates")).toEqual({
      label: "telegram updates",
      ok: false,
      detail: expect.stringMatching(/read by something else \(409 Conflict: .*\); Telegram gives them to one reader, so amy needs a bot of its own/),
    });
  });

  it("says why when the token itself is refused", async () => {
    const amy = new TelegramConversation(new BotApi("0:wrong", { transport: botApiStandIn().transport }), {
      operator: String(OPERATOR),
      directory: fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-doctor-")),
    });

    expect(await amy.checks()).toEqual([{ label: "telegram bot", ok: false, detail: "telegram getMe refused: 401 Unauthorized" }]);
  });
});
