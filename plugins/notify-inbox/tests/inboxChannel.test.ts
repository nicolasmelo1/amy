import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { inboxChannel } from "../src/inboxChannel.js";

const announcement = {
  text: "ACME-1 needs an answer before I can start.",
  workId: "ACME-1",
  state: "CLARIFYING",
};

describe("inboxChannel", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-inbox-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("leaves the question on disk, where a missed notification cannot lose it", async () => {
    const runner = new ScriptedRunner();
    const inbox = path.join(root, "needs-input");

    await inboxChannel(inbox, runner).deliver(announcement);

    const files = fs.readdirSync(inbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("ACME-1");

    const written = fs.readFileSync(path.join(inbox, files[0]!), "utf-8");
    expect(written).toContain("# ACME-1");
    expect(written).toContain("State: CLARIFYING");
    expect(written).toContain(announcement.text);
  });

  it("raises a desktop notification as well", async () => {
    const runner = new ScriptedRunner();

    await inboxChannel(path.join(root, "needs-input"), runner).deliver(announcement);

    const script = runner.callsTo("osascript")[0]!.args[1]!;
    expect(script).toContain("display notification");
    expect(script).toContain("amy ACME-1");
  });

  it("flattens the text so a newline cannot break the AppleScript", async () => {
    const runner = new ScriptedRunner();

    await inboxChannel(path.join(root, "needs-input"), runner).deliver({
      ...announcement,
      text: "line one\nline two",
    });

    const script = runner.callsTo("osascript")[0]!.args[1]!;
    expect(script).toContain('"line one line two"');
    expect(script).not.toContain("\n");
  });

  it("escapes a quote in the text", async () => {
    const runner = new ScriptedRunner();

    await inboxChannel(path.join(root, "needs-input"), runner).deliver({
      ...announcement,
      text: 'he said "no"',
    });

    expect(runner.callsTo("osascript")[0]!.args[1]).toContain('\\"no\\"');
  });

  it("creates the directory the first time", async () => {
    const runner = new ScriptedRunner();
    const inbox = path.join(root, "deep", "needs-input");

    await inboxChannel(inbox, runner).deliver(announcement);

    expect(fs.existsSync(inbox)).toBe(true);
  });
});
