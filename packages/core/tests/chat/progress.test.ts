import { describe, expect, it } from "vitest";
import { ChatProgress, Conversation } from "../../src/index.js";

/** A chat that records what was said and what was edited, declaring edit or not. */
function chat(edit: boolean) {
  const said: { place: string; text: string }[] = [];
  const edits: { place: string; id: string; text: string }[] = [];
  const conversation: Pick<Conversation, "edit" | "say" | "revise"> = {
    ...(edit ? { edit: true as const } : {}),
    say: async (place, text) => {
      said.push({ place, text });
      return `m${said.length}`;
    },
    revise: async (place, id, text) => {
      edits.push({ place, id, text });
    },
  };
  return { conversation, said, edits };
}

describe("a long turn's progress (A7)", () => {
  it("is one message edited in place where the adapter declares edit", async () => {
    const { conversation, said, edits } = chat(true);
    const progress = new ChatProgress(conversation, "chat-1");

    await progress.line("Thinking with claude…");
    await progress.line("Running amy status…");
    await progress.line("amy status: done");

    expect(said).toEqual([{ place: "chat-1", text: "Thinking with claude…" }]);
    expect(edits).toEqual([
      { place: "chat-1", id: "m1", text: "Thinking with claude…\nRunning amy status…" },
      { place: "chat-1", id: "m1", text: "Thinking with claude…\nRunning amy status…\namy status: done" },
    ]);
  });

  it("is one line per message where the adapter does not declare edit, even if it could", async () => {
    const { conversation, said, edits } = chat(false);
    const progress = new ChatProgress(conversation, "chat-1");

    await progress.line("Thinking with claude…");
    await progress.line("Running amy status…");

    expect(said.map((one) => one.text)).toEqual(["Thinking with claude…", "Running amy status…"]);
    expect(edits).toEqual([]);
  });

  it("refuses a conversation that cannot say anything in the chat", async () => {
    await expect(new ChatProgress({}, "chat-1").line("x")).rejects.toThrow(/cannot say anything/);
  });
});
