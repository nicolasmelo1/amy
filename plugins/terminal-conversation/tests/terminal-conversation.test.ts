import os from "node:os";
import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { plugin, terminalConversation, TerminalConversation } from "../src/index.js";

/** Who a reply says wrote it: the person at this machine, whoever that is. */
const who = (): string => os.userInfo().username || "operator";

/** A keyboard nobody types into until the test does: paused, so what arrives waits to be read. */
function keyboard(): Readable {
  return new Readable({ read() {} });
}

/** The screen the conversation posts to, kept as text to assert on. */
function screen(): { stream: Writable; text: () => string } {
  let written = "";
  const stream = new Writable({ write(chunk, _encoding, done) {
    written += String(chunk);
    done();
  } });
  return { stream, text: () => written };
}

/** One conversation over fakes, with the person's typing held back until the test types it. */
function conversation(): { amy: TerminalConversation; type: (line: string) => void; end: () => void; out: { text: () => string } } {
  const input = keyboard();
  const out = screen();
  const amy = terminalConversation(input, out.stream);
  return { amy, type: (line: string) => void input.push(line), end: () => void input.push(null), out };
}

/** An instant before everything, so a first look reads every reply that has arrived. */
const FROM_THE_START = new Date(0).toISOString();

describe("the terminal conversation", () => {
  it("opens the work's thread under its own id, announcing its title once", async () => {
    const { amy, out } = conversation();
    await expect(amy.open("SETUP", "Set up amy")).resolves.toEqual({ id: "SETUP" });
    await amy.open("SETUP", "Set up amy");
    expect(out.text()).toBe("Set up amy\n\n");
  });

  it("answers an approval ask typed y with the decision Slack and Telegram return", async () => {
    const { amy, type, out } = conversation();
    expect(amy.asks).toBe(true);
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "The walk is done", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    expect(out.text()).toContain("Ship it? (y/n)");

    type("y\n");
    expect(await amy.replies(thread, FROM_THE_START)).toEqual([{
      at: expect.any(String),
      author: who(),
      text: "Ship it?",
      files: [],
      kind: "decision",
      answer: { ask: "ship", chosen: ["approve"] },
    }]);
  });

  it("answers an approval ask typed n with a rejection", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    type("n\n");
    expect((await amy.replies(thread, FROM_THE_START))[0]!.answer).toEqual({ ask: "ship", chosen: ["reject"] });
  });

  it("answers an approval by its answers' own names", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    type("approve\n");
    expect((await amy.replies(thread, FROM_THE_START))[0]!.answer).toEqual({ ask: "ship", chosen: ["approve"] });
  });

  it("answers a choice by number: the 2 typed names the second answer, and the numbers are drawn", async () => {
    const { amy, type, out } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "One to keep", ask: { id: "currency", prompt: "Which currency?", form: "choice", answers: ["BRL", "USD"] } });
    expect(out.text()).toContain("1. BRL\n2. USD");

    type("2\n");
    expect((await amy.replies(thread, FROM_THE_START))[0]!.answer).toEqual({ ask: "currency", chosen: ["USD"] });
  });

  it("answers a choice by an answer's own text, however it is cased", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "currency", prompt: "Which currency?", form: "choice", answers: ["BRL", "USD"] } });
    type("USD\n");
    await amy.post(thread, { text: "", ask: { id: "colour", prompt: "Which colour?", form: "choice", answers: ["red", "blue"] } });
    type("BLUE\n");
    expect((await amy.replies(thread, FROM_THE_START)).map((reply) => reply.answer)).toEqual([
      { ask: "currency", chosen: ["USD"] },
      { ask: "colour", chosen: ["blue"] },
    ]);
  });

  it("answers a choices ask with every one chosen, in the ask's order whatever order they were typed", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "channels", prompt: "Which channels?", form: "choices", answers: ["slack", "telegram", "email"] } });
    type("1,3\n");
    await amy.post(thread, { text: "", ask: { id: "colours", prompt: "Which colours?", form: "choices", answers: ["red", "blue", "green"] } });
    type("3,1\n");
    await amy.post(thread, { text: "", ask: { id: "again", prompt: "Once more?", form: "choices", answers: ["slack", "telegram", "email"] } });
    type("email, slack\n");
    expect((await amy.replies(thread, FROM_THE_START)).map((reply) => reply.answer)).toEqual([
      { ask: "channels", chosen: ["slack", "email"] },
      { ask: "colours", chosen: ["red", "green"] },
      { ask: "again", chosen: ["slack", "email"] },
    ]);
  });

  it("carries a line typed with no ask pending as a plain reply, with no kind", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "The build broke" });
    type("I saw it too\n");
    const [reply] = await amy.replies(thread, FROM_THE_START);
    expect(reply).toEqual({ at: expect.any(String), author: who(), text: "I saw it too", files: [] });
    expect("kind" in reply!).toBe(false);
  });

  it("returns only what arrived after since, oldest first, and refuses a since that is not an instant", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "Say two things" });
    type("first\n");
    type("second\n");
    const both = await amy.replies(thread, FROM_THE_START);
    expect(both.map((reply) => reply.text)).toEqual(["first", "second"]);
    expect(await amy.replies(thread, both[0]!.at)).toEqual([both[1]]);
    expect(await amy.replies(thread, both[1]!.at)).toEqual([]);
    await expect(amy.replies(thread, "yesterday")).rejects.toThrow(/not an instant/);
  });

  it("returns no reply when the input ends with the ask unanswered: the host decides what that means", async () => {
    const { amy, end } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    end();
    expect(await amy.replies(thread, FROM_THE_START)).toEqual([]);
  });

  it("takes the last line without its Enter once the input ends", async () => {
    const { amy, type, end } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    type("y");
    end();
    expect(await amy.replies(thread, FROM_THE_START)).toEqual([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect((await amy.replies(thread, FROM_THE_START))[0]).toMatchObject({ kind: "decision", answer: { ask: "ship", chosen: ["approve"] } });
  });

  it("keeps an ask standing when a line names none of its answers, and reads that line as a plain turn", async () => {
    const { amy, type } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });
    type("what would shipping do?\n");
    type("y\n");
    const replies = await amy.replies(thread, FROM_THE_START);
    expect(replies[0]).toMatchObject({ text: "what would shipping do?", files: [] });
    expect("kind" in replies[0]!).toBe(false);
    expect(replies[1]).toMatchObject({ kind: "decision", answer: { ask: "ship", chosen: ["approve"] } });
  });

  it("gives a re-posted ask the one post it already made, and hands back growing message ids", async () => {
    const { amy, type, out } = conversation();
    const thread = await amy.open("SETUP", "Set up amy");
    const ask = { id: "ship", prompt: "Ship it?", form: "approval" as const, answers: ["approve", "reject"] as ["approve", "reject"] };
    expect(await amy.post(thread, { text: "", ask })).toBe("1");
    expect(await amy.post(thread, { text: "Understood" })).toBe("2");
    expect(await amy.post(thread, { text: "", ask })).toBe("1");
    expect(out.text().match(/Ship it\? \(y\/n\)/g)).toHaveLength(1);

    type("y\n");
    expect((await amy.replies(thread, FROM_THE_START)).filter((reply) => reply.kind === "decision")).toHaveLength(1);
  });

  it("writes what it is given to the output: text, local file paths, numbered answers", async () => {
    const { amy, out } = conversation();
    const thread = await amy.open("W", "Work");
    await amy.post(thread, { text: "Look", files: ["/tmp/a.png", "/tmp/b.png"] });
    expect(out.text()).toContain("Look\n/tmp/a.png\n/tmp/b.png\n");
    await amy.post(thread, { text: "Pick", ask: { id: "pick", prompt: "Which?", form: "choice", answers: ["one", "two"] } });
    expect(out.text()).toContain("Pick\nWhich?\n1. one\n2. two\n");
  });

  it("files a plain line under the thread whose line the person last saw", async () => {
    const { amy, type } = conversation();
    const one = await amy.open("ONE", "One");
    const two = await amy.open("TWO", "Two");
    await amy.post(two, { text: "Where are we?" });
    type("here\n");
    expect(await amy.replies(one, FROM_THE_START)).toEqual([]);
    expect((await amy.replies(two, FROM_THE_START)).map((reply) => reply.text)).toEqual(["here"]);
  });
});

describe("the terminal-conversation plugin", () => {
  it("mounts the conversation port, the one thing it owns, over the person's own stdio", () => {
    const ports = new Map<string, object>();
    const registry = {
      port: (kind: string, impl: object) => void ports.set(kind, impl),
      contribute: () => {},
      action: () => {},
      workflow: () => {},
    };
    plugin.register(registry as never, { config: {}, paths: { state: os.tmpdir() }, readOnly: false } as never);
    expect([...ports.keys()]).toEqual(["conversation"]);
    expect((ports.get("conversation") as TerminalConversation).asks).toBe(true);
  });
});
