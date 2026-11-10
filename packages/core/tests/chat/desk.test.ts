import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AskContext, ChatAction, ChatDesk, ChatMessage, Conversation, Harness, NO_TOKENS, answerTheChat } from "../../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A harness that answers from a script and remembers every prompt and context it was given. */
function harness(name: string, answers: string[] = [], refuse?: string) {
  const asked: { prompt: string; context?: AskContext }[] = [];
  const cli: Harness = {
    name,
    ask: async (prompt, _cwd, context) => {
      asked.push({ prompt, context });
      if (refuse) throw new Error(refuse);
      return { text: answers.shift() ?? `answer ${asked.length}`, run: { outcome: "completed", tokens: NO_TOKENS, durationMs: 1 } as never };
    },
  };
  return { cli, asked };
}

/** A chat holding messages until they are settled, and what amy said in it. */
function chatOf(edit = false) {
  const pending: ChatMessage[] = [];
  const said: { place: string; text: string }[] = [];
  let next = 0;
  const conversation: Conversation = {
    open: async () => ({ id: "x" }),
    post: async () => "x",
    replies: async () => [],
    ...(edit ? { edit: true as const } : {}),
    chat: async () => [...pending],
    settle: async (id) => {
      pending.splice(pending.findIndex((one) => one.id === id), 1);
    },
    say: async (place, text) => {
      said.push({ place, text });
      return String(++next);
    },
    revise: async () => undefined,
  };
  const write = (text: string, extra: Partial<ChatMessage> = {}) => pending.push({ id: `m${pending.length}-${Date.now()}-${Math.random()}`, at: new Date().toISOString(), author: "op", text, place: "chat", ...extra });
  return { conversation, said, write, pending };
}

function deskOf(conversation: Conversation, harnesses: Record<string, Harness>, extra: Partial<ChatDesk> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-desk-"));
  dirs.push(directory);
  const acted: ChatAction[] = [];
  const desk: ChatDesk = {
    conversation,
    harnesses: new Map(Object.entries(harnesses)),
    cwd: directory,
    directory,
    commands: [{ words: ["status"], summary: "what is running" }, { words: ["restart"], summary: "restart" }],
    act: async (action) => {
      acted.push(action);
      return { text: `ran ${action.asked.commands.map((one) => one.line).join(", ")}` };
    },
    ...extra,
  };
  return { desk, acted };
}

const last = (said: { text: string }[]) => said.at(-1)!.text;

describe("an ask writes nothing (A2)", () => {
  it("runs the harness read-only and runs nothing it names", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["Here is how.\n```amy\nstatus\n```"]);
    const { desk, acted } = deskOf(chat.conversation, { claude: claude.cli });
    chat.write("what is running?");

    expect(await answerTheChat(desk)).toMatchObject({ answered: 1 });
    expect(claude.asked[0]!.context).toMatchObject({ readOnly: true });
    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/Nothing ran: a command runs only when the message starts with \/action/);
    expect(chat.pending).toEqual([]);
  });

  it("says nothing ran when the harness cannot run read-only, naming one that can", async () => {
    const chat = chatOf();
    const { desk, acted } = deskOf(chat.conversation, { hermes: harness("hermes", [], "hermes cannot run read-only").cli, claude: harness("claude").cli });
    chat.write("/harness hermes");
    chat.write("hi");

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/hermes could not answer read-only, so nothing ran: hermes cannot run read-only\nAnother can: \/harness claude/);
  });
});

describe("only an action acts (A3)", () => {
  it("runs the commands an answer names under /action, and the same answer without it runs none", async () => {
    const answer = "Restarting.\n```amy\nrestart\n```";
    const chat = chatOf();
    const { desk, acted } = deskOf(chat.conversation, { claude: harness("claude", [answer, answer]).cli });

    chat.write("restart please");
    await answerTheChat(desk);
    expect(acted).toEqual([]);

    chat.write("/action restart please");
    await answerTheChat(desk);
    expect(acted.map((one) => one.asked.commands.map((command) => command.argv))).toEqual([[["restart"]]]);
    expect(last(chat.said)).toMatch(/ran restart/);
  });

  it("refuses the whole batch by name when one line is off the list", async () => {
    const chat = chatOf();
    const { desk, acted } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nstatus\nrm -rf /\n```"]).cli });
    chat.write("/action clean up");

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/Refused, and nothing ran:\n- `rm -rf \/`: `rm -rf` is not a command amy runs from the chat/);
  });

  it("hands back what to do once the answer is said", async () => {
    const chat = chatOf();
    let exited = false;
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nrestart\n```"]).cli }, {
      act: async () => ({ text: "restarting", after: async () => { exited = true; } }),
    });
    chat.write("/action restart");

    const pass = await answerTheChat(desk);
    expect(exited).toBe(false);
    await Promise.all(pass.after.map((after) => after()));
    expect(exited).toBe(true);
  });
});

describe("a conversation carries its turns (A5)", () => {
  it("gives the third turn the first two, and a harness switched to them too", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["first answer", "second answer"]);
    const codex = harness("codex", ["third answer"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli, codex: codex.cli });

    chat.write("first question");
    await answerTheChat(desk);
    chat.write("second question");
    await answerTheChat(desk);
    chat.write("/harness codex");
    await answerTheChat(desk);
    expect(last(chat.said)).toMatch(/answered by codex from now on, and it is given the 4 turns before/);
    chat.write("third question");
    await answerTheChat(desk);

    const prompt = codex.asked[0]!.prompt;
    expect(prompt).toMatch(/Person: first question\n\namy: first answer\n\nPerson: second question\n\namy: second answer/);
    expect(prompt.endsWith("Person: third question")).toBe(true);
  });

  it("starts another conversation in a chat without threads only on /new", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });

    chat.write("remember the word kiwi");
    await answerTheChat(desk);
    chat.write("/new");
    await answerTheChat(desk);
    chat.write("what was the word?");
    await answerTheChat(desk);

    expect(claude.asked[1]!.prompt).not.toMatch(/kiwi/);
  });

  it("keeps a thread one conversation", async () => {
    const chat = chatOf();
    const { desk } = deskOf(chat.conversation, { claude: harness("claude").cli });
    chat.write("/new", { place: "thread-1", threaded: true });

    await answerTheChat(desk);

    expect(last(chat.said)).toMatch(/A thread is one conversation/);
  });

  it("refuses a harness that is not mounted, naming those that are", async () => {
    const chat = chatOf();
    const { desk } = deskOf(chat.conversation, { claude: harness("claude").cli });
    chat.write("/harness gpt");

    await answerTheChat(desk);

    expect(last(chat.said)).toBe("No harness is named `gpt`. Mounted: claude.");
  });
});

describe("the chat outlives a broken mount", () => {
  it("names what did not mount with every answer", async () => {
    const chat = chatOf();
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["fine"]).cli }, { mountProblem: "workflow ./broken: no such file" });
    chat.write("hello");

    await answerTheChat(desk);

    expect(last(chat.said)).toBe("⚠️ The workflow did not mount, so only the chat is running: workflow ./broken: no such file\n\nfine");
  });

  it("says no harness can answer when none is mounted", async () => {
    const chat = chatOf();
    const { desk } = deskOf(chat.conversation, {});
    chat.write("hello");

    await answerTheChat(desk);

    expect(last(chat.said)).toBe("No harness is mounted, so nothing can answer here.");
  });
});

describe("a message is answered once", () => {
  it("is skipped by a second desk while the first holds its claim", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    chat.write("hello");
    const message = chat.pending[0]!;

    await answerTheChat(desk);
    chat.pending.push(message);
    await answerTheChat(desk);

    expect(claude.asked).toHaveLength(1);
  });

  it("answers nothing on a conversation that has no chat", async () => {
    const { desk } = deskOf({ open: async () => ({ id: "x" }), post: async () => "x", replies: async () => [] }, {});
    expect(await answerTheChat(desk)).toEqual({ answered: 0, after: [] });
  });

  it("says when a quote reached no work", async () => {
    const chat = chatOf(true);
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["ok"]).cli });
    chat.write("this?", { unaddressed: true });

    await answerTheChat(desk);

    expect(last(chat.said)).toMatch(/^That quoted message is not one I filed under a work/);
  });
});

describe("one conversation is answered by one loop at a time", () => {
  it("leaves a place another loop is answering, and answers it once that loop lets go", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    let release!: () => void;
    const slow: Harness = { name: "claude", ask: (prompt, cwd, context) => new Promise((resolve) => { release = () => resolve(claude.cli.ask(prompt, cwd, context)); }) };
    const first = { ...desk, harnesses: new Map([["claude", slow]]) };
    chat.write("first");

    const answering = answerTheChat(first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    chat.write("second");
    expect(await answerTheChat(desk)).toMatchObject({ answered: 0 });

    release();
    await answering;
    await answerTheChat(desk);
    expect(claude.asked.map((one) => one.prompt.split("\n\n").at(-1))).toEqual(["Person: first", "Person: second"]);
    expect(claude.asked[1]!.prompt).toMatch(/Person: first\n\namy: answer 1/);
  });
});

describe("a conversation is held to the budget only when it is asked to be", () => {
  const run = { harness: "claude", model: "sonnet", outcome: "completed", durationMs: 5, costSource: "reported", costUsd: 0.25, tokens: { input: 10, output: 5 } };
  const paid: Harness = { name: "claude", ask: async () => ({ text: "fine", run: run as never }) };
  const ledger = () => {
    const events: { kind: string; workId?: string; detail?: Record<string, unknown> }[] = [];
    return { events, log: { append: (event: never) => void events.push(event), read: () => [] } as never };
  };

  it("counts nothing by default", async () => {
    const chat = chatOf();
    const { desk } = deskOf(chat.conversation, { claude: paid });
    chat.write("hello");

    await answerTheChat(desk);

    expect(chat.said.at(-1)!.text).toBe("fine");
  });

  it("records each run against the chat when counted, and refuses a turn the ceiling stops", async () => {
    const chat = chatOf();
    const { events, log } = ledger();
    let open = true;
    const budget = { mayStart: () => (open ? { ok: true as const } : { ok: false as const, window: "perDay", measure: "costUsd" as const, used: 9, limit: 10, stopAt: 0.9, retryAfterMs: 1000, reason: "the perDay budget has spent 9 of its 10 costUsd ceiling, and new work stops at 90%" }) };
    const { desk } = deskOf(chat.conversation, { claude: paid }, { spend: { budget, log } });

    chat.write("hello");
    await answerTheChat(desk);
    open = false;
    chat.write("again");
    await answerTheChat(desk);

    expect(events).toEqual([{ at: expect.any(String), kind: "agent.run", workId: "chat", detail: { harness: "claude", model: "sonnet", outcome: "completed", durationMs: 5, costSource: "reported", costUsd: 0.25, tokens: { input: 10, output: 5 } } }]);
    expect(chat.said.at(-1)!.text).toBe("Not answered: the perDay budget has spent 9 of its 10 costUsd ceiling, and new work stops at 90%.");
  });
});

describe("what a pass does not lose and does not act on", () => {
  it("ends the pass once a turn hands back something to do, leaving later messages for the next pass", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["```amy\nrestart\n```", "later"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, { act: async () => ({ text: "restarting", after: async () => undefined }) });
    chat.write("/action restart");
    chat.write("and then?");

    const pass = await answerTheChat(desk);

    expect(pass).toMatchObject({ answered: 1, after: [expect.any(Function)] });
    expect(chat.pending.map((one) => one.text)).toEqual(["and then?"]);
  });

  it.each([
    ["a run that did not complete", { outcome: "failed" }, "```amy\nrestart\n```", /claude did not finish this turn \(failed\), so nothing ran\./],
    ["an empty answer", { outcome: "completed" }, "   ", /claude answered nothing, so nothing ran\./],
  ])("acts on nothing from %s", async (_case, run, text, said) => {
    const chat = chatOf();
    const cli: Harness = { name: "claude", ask: async () => ({ text, run: run as never }) };
    const { desk, acted } = deskOf(chat.conversation, { claude: cli });
    chat.write("/action restart");

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(said);
  });

  it("keeps two sources' conversations apart, even where they number a place alike", async () => {
    const one = chatOf();
    const two = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf({ ...one.conversation, source: "telegram:1" }, { claude: claude.cli });
    one.write("remember kiwi");
    await answerTheChat(desk);
    two.write("what was it?");

    await answerTheChat({ ...desk, conversation: { ...two.conversation, source: "telegram:2" } });

    expect(claude.asked[1]!.prompt).not.toMatch(/kiwi/);
  });

  it("takes over a claim left by a loop that died mid-turn", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    chat.write("hello");
    const message = chat.pending[0]!;
    await answerTheChat(desk);
    chat.pending.push(message);

    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(claude.asked).toHaveLength(2);
  });
});

describe("a turn that fails", () => {
  it("lets go of a message nothing ran for, so the next pass asks it again before later ones", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    let failing = true;
    const say = chat.conversation.say!;
    chat.conversation.say = async (place, text) => {
      if (failing) throw new Error("telegram is down");
      return say(place, text);
    };
    chat.write("first");
    chat.write("second");

    await expect(answerTheChat(desk)).rejects.toThrow(/telegram is down/);
    failing = false;
    await answerTheChat(desk);

    expect(claude.asked.map((one) => one.prompt.split("\n\n").at(-1))).toEqual(["Person: first", "Person: second"]);
  });

  it("settles a message whose commands ran, so a retry never runs them twice", async () => {
    const chat = chatOf();
    let ran = 0;
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nstatus\n```"]).cli }, {
      act: async () => {
        ran += 1;
        throw new Error("the command crashed");
      },
    });
    chat.write("/action status");

    await expect(answerTheChat(desk)).rejects.toThrow(/the command crashed/);
    await answerTheChat(desk);

    expect(ran).toBe(1);
    expect(chat.pending).toEqual([]);
  });

  it("does not act on /action in a quote that reached no work", async () => {
    const chat = chatOf();
    const { desk, acted } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nrestart\n```"]).cli });
    chat.write("/action restart", { unaddressed: true });

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/answered as a question[\s\S]*Nothing ran: a command runs only when the message starts with \/action/);
  });

  it("leaves a stale claim another loop is recovering", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    chat.write("hello");
    const message = chat.pending[0]!;
    await answerTheChat(desk);
    chat.pending.push(message);
    const claims = path.join(desk.directory, "claims");
    for (const name of fs.readdirSync(claims)) fs.writeFileSync(path.join(claims, `${name}.recovering`), "another loop");

    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(claude.asked).toHaveLength(1);
  });
});
