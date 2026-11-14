import { createHash } from "node:crypto";
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
    lendsSkill: true,
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
    known: async () => undefined,
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

  it("keeps an accepted restart when settlement fails", async () => {
    const chat = chatOf();
    let exited = false;
    const { desk } = deskOf({
      ...chat.conversation,
      settle: async () => { throw new Error("chat temporarily unavailable"); },
    }, { claude: harness("claude", ["```amy\nrestart\n```"]).cli }, {
      act: async () => ({ text: "restarting", after: async () => { exited = true; } }),
    });
    chat.write("/action restart");

    const pass = await answerTheChat(desk);

    expect(pass.after).toHaveLength(1);
    await pass.after[0]!();
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
    const { desk } = deskOf({ known: async () => undefined, open: async () => ({ id: "x" }), post: async () => "x", replies: async () => [] }, {});
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
  it("keeps inbox order across conversations, so an earlier stop leaves later messages queued", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["first", "```amy\nrestart\n```"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, {
      act: async () => ({ text: "restarting", after: async () => undefined }),
    });
    chat.write("first", { place: "a" });
    chat.write("/action restart", { place: "b" });
    chat.write("must wait", { place: "a" });

    const pass = await answerTheChat(desk);

    expect(pass).toMatchObject({ answered: 2, after: [expect.any(Function)] });
    expect(chat.pending.map((one) => one.text)).toEqual(["must wait"]);
    expect(claude.asked).toHaveLength(2);
  });

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

  it("names a read-only refusal returned by the harness and another harness that can answer", async () => {
    const chat = chatOf();
    const hermes: Harness = { name: "hermes", ask: async () => ({ text: "", run: { outcome: "failed", output: "Hermes refuses read-only execution" } as never }) };
    const { desk, acted } = deskOf(chat.conversation, { hermes, claude: harness("claude").cli });
    chat.write("/harness hermes");
    await answerTheChat(desk);
    chat.write("can you inspect this?");

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toContain("Hermes refuses read-only execution");
    expect(last(chat.said)).toContain("Another can: /harness claude");
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
    const claims = path.join(desk.directory, "claims");
    fs.mkdirSync(claims, { recursive: true });
    fs.writeFileSync(path.join(claims, createHash("sha256").update(`|${chat.pending[0]!.id}`).digest("hex").slice(0, 32)), "a loop that died");

    await answerTheChat(desk);
    expect(claude.asked).toHaveLength(0);
    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(claude.asked).toHaveLength(1);
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
      act: async ({ running }) => {
        running();
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
    const claims = path.join(desk.directory, "claims");
    fs.mkdirSync(claims, { recursive: true });
    const file = path.join(claims, createHash("sha256").update(`|${chat.pending[0]!.id}`).digest("hex").slice(0, 32));
    fs.writeFileSync(file, "a loop that died");
    // Another loop linked the dead claim to its tombstone and is about to remove it.
    fs.linkSync(file, `${file}.dead-${createHash("sha256").update("a loop that died").digest("hex").slice(0, 16)}`);

    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(claude.asked).toHaveLength(0);
  });

  it("settles a copy of a message already answered, without answering it again", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli });
    chat.write("hello");
    const message = chat.pending[0]!;
    await answerTheChat(desk);
    chat.pending.push(message);

    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(claude.asked).toHaveLength(1);
    expect(chat.pending).toEqual([]);
  });

  it("still restarts when the answer saying so cannot be sent", async () => {
    const chat = chatOf();
    let restarted = false;
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nrestart\n```"]).cli }, {
      act: async ({ running }) => {
        running();
        return { text: "restarting", after: async () => { restarted = true; } };
      },
    });
    const say = chat.conversation.say!;
    chat.conversation.say = async (place, text) => {
      if (text.includes("restarting")) throw new Error("telegram is down");
      return say(place, text);
    };
    chat.write("/action restart");

    const pass = await answerTheChat(desk);
    await Promise.all(pass.after.map((after) => after()));

    expect(restarted).toBe(true);
    expect(chat.pending).toEqual([]);
  });

  it("starts nothing and switches nothing from a quote that reached no work", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk } = deskOf(chat.conversation, { claude: claude.cli, codex: harness("codex").cli });
    chat.write("remember kiwi");
    await answerTheChat(desk);
    chat.write("/new", { unaddressed: true });
    chat.write("/harness codex", { unaddressed: true });
    await answerTheChat(desk);

    expect(claude.asked).toHaveLength(3);
    expect(claude.asked[2]!.prompt).toMatch(/remember kiwi/);
  });
});

describe("a turn whose host failed before anything ran", () => {
  it("is asked again, though the commands were reached", async () => {
    const chat = chatOf();
    let tries = 0;
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nstatus\n```", "```amy\nstatus\n```"]).cli }, {
      act: async ({ running }) => {
        tries += 1;
        if (tries === 1) throw new Error("the progress edit failed");
        running();
        return { text: "ran status" };
      },
    });
    chat.write("/action status");

    await expect(answerTheChat(desk)).rejects.toThrow(/the progress edit failed/);
    await answerTheChat(desk);

    expect(tries).toBe(2);
    expect(last(chat.said)).toMatch(/ran status/);
  });
});

describe("a refusal is part of the conversation", () => {
  it("gives a harness switched to after a refusal the question that was refused", async () => {
    const chat = chatOf();
    const codex = harness("codex");
    const { desk } = deskOf(chat.conversation, { hermes: harness("hermes", [], "hermes cannot run read-only").cli, codex: codex.cli });
    chat.write("how is the api project?");
    await answerTheChat(desk);
    chat.write("/harness codex");
    await answerTheChat(desk);
    chat.write("try that again");

    await answerTheChat(desk);

    expect(codex.asked[0]!.prompt).toMatch(/Person: how is the api project\?\n\namy: hermes could not answer read-only/);
  });
});

describe("what ran is remembered", () => {
  it("keeps an exchange whose commands ran, though the answer could not be said", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["```amy\nstatus\n```", "it ran status"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, { act: async ({ running }) => { running(); return { text: "status: done" }; } });
    const say = chat.conversation.say!;
    chat.conversation.say = async (place, text) => {
      if (text.includes("status: done")) throw new Error("telegram is down");
      return say(place, text);
    };
    chat.write("/action status");
    await expect(answerTheChat(desk)).rejects.toThrow(/telegram is down/);
    chat.conversation.say = say;
    chat.write("what did you run?");

    await answerTheChat(desk);

    expect(claude.asked[1]!.prompt).toMatch(/Person: \/action status\n\namy: [\s\S]*status: done/);
  });

  it("marks a message done the moment its commands run, so a loop killed after never runs it again", async () => {
    const chat = chatOf();
    let runs = 0;
    const { desk } = deskOf(chat.conversation, { claude: harness("claude", ["```amy\nstatus\n```"]).cli }, {
      act: async ({ running }) => {
        running();
        runs += 1;
        return new Promise(() => undefined);
      },
    });
    chat.write("/action status");
    const message = chat.pending[0]!;

    void answerTheChat(desk);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await answerTheChat({ ...desk, now: () => new Date(Date.now() + 11 * 60 * 1000) });

    expect(runs).toBe(1);
    expect(chat.pending).not.toContain(message);
  });
});

/** A skill installed where the chat's table says it is: a directory holding its SKILL.md. */
const GROOM = installedSkill("amy-groom");

function installedSkill(name: string): string {
  const at = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-desk-skill-")), name);
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, "SKILL.md"), `# ${name}\n`);
  return at;
}

describe("a skill is asked for in the chat (A4, A5, A6, A7, A9)", () => {
  const groom = new Map<string, string | undefined>([["amy-groom", GROOM]]);

  it("answers a message starting with /amy-groom as an action turn, with the skill lent", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["Ask away.\n```amy\nstatus\n```"]);
    const { desk, acted } = deskOf(chat.conversation, { claude: claude.cli }, { skills: groom });
    chat.write("  /amy-groom@amy_work_bot PROJ-1");

    expect(await answerTheChat(desk)).toMatchObject({ answered: 1 });
    expect(claude.asked[0]!.prompt.startsWith("/amy-groom\n\n")).toBe(true);
    expect(claude.asked[0]!.prompt).toMatch(/Person: PROJ-1$/);
    expect(claude.asked[0]!.context).toMatchObject({
      readOnly: true,
      step: "chat",
      skill: { name: "amy-groom", path: GROOM },
    });
    expect(acted.map((one) => one.asked.commands.map((command) => command.argv))).toEqual([[["status"]]]);
  });

  it("keeps the skill for the thread, and /new ends it", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["first", "second", "third"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, { skills: groom });

    chat.write("/amy-groom PROJ-1");
    await answerTheChat(desk);
    chat.write("the scope is the api");
    await answerTheChat(desk);

    expect(claude.asked[1]!.prompt.startsWith("/amy-groom\n\n")).toBe(true);
    expect(claude.asked[1]!.context?.skill).toEqual({ name: "amy-groom", path: GROOM });

    chat.write("/new");
    await answerTheChat(desk);
    chat.write("hello");
    await answerTheChat(desk);

    expect(claude.asked[2]!.context?.skill).toBeUndefined();
    expect(claude.asked[2]!.prompt.startsWith("/amy-groom")).toBe(false);
  });

  it("names the ladder when the skill is not on it, and nothing runs", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk, acted } = deskOf(chat.conversation, { claude: claude.cli }, { skills: groom });
    chat.write("/northwind-code-review PROJ-1");

    await answerTheChat(desk);

    expect(claude.asked).toEqual([]);
    expect(acted).toEqual([]);
    expect(last(chat.said)).toBe("No skill named `/northwind-code-review` is on this chat's ladder. The skills it names: /amy-groom.");
  });

  it("refuses a skill the ladder names but this machine does not hold, naming amy skills", async () => {
    const chat = chatOf();
    const claude = harness("claude");
    const { desk, acted } = deskOf(chat.conversation, { claude: claude.cli }, { skills: new Map([["amy-groom", undefined]]) });
    chat.write("/amy-groom PROJ-1");

    await answerTheChat(desk);

    expect(claude.asked).toEqual([]);
    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/`\/amy-groom` is on this chat's ladder, but it is not installed here: nothing ran\. Run `amy skills`/);
  });

  it("stays read-only in a skill turn, and refuses a command off the list", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["```amy\nstatus\nrm -rf /\n```"]);
    const { desk, acted } = deskOf(chat.conversation, { claude: claude.cli }, { skills: groom });
    chat.write("/amy-groom PROJ-1");

    await answerTheChat(desk);

    expect(claude.asked[0]!.context?.readOnly).toBe(true);
    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/Refused, and nothing ran:/);
  });

  it("writes a multiline section from a block, and the next check reads it", async () => {
    const chat = chatOf();
    const body = "the scope:\n- the api\n- the ui\n";
    const written = new Map<string, string>();
    const claude = harness("claude", [
      `Here it is.\n\`\`\`markdown answer.md\n${body}\`\`\`\n\`\`\`amy\nbrief write PROJ-1 scope --from answer.md\n\`\`\``,
      "```amy\nbrief check PROJ-1 --json\n```",
    ]);
    const ran: string[] = [];
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, {
      skills: groom,
      commands: [
        { words: ["brief", "write"], args: "<id> <section>", flags: { "--from": true }, blocks: ["--from"], summary: "answer one section" },
        { words: ["brief", "check"], args: "<id>", flags: { "--json": false }, summary: "whether it is ready" },
      ],
      act: async ({ asked }) => {
        for (const command of asked.commands) {
          const name = command.argv.slice(0, 2).join(" ");
          if (name === "brief write") {
            const from = command.argv[command.argv.indexOf("--from") + 1]!;
            written.set(`${command.argv[2]}/scope`, asked.blocks.get(from)!);
            ran.push(`wrote ${command.argv[3]}`);
          }
          if (name === "brief check") ran.push(written.get(`${command.argv[2]}/scope`) ?? "no brief");
        }
        return { text: ran.join("\n") };
      },
    });

    chat.write("/amy-groom PROJ-1");
    await answerTheChat(desk);
    chat.write("and the check?");
    await answerTheChat(desk);

    expect(written.get("PROJ-1/scope")).toBe(body);
    expect(last(chat.said)).toContain(body);
  });
});

describe("a harness that cannot be handed a skill (A4, A7)", () => {
  it("refuses a skill turn on it, names one that can, and runs nothing", async () => {
    const chat = chatOf();
    const codex: Harness = {
      name: "codex",
      ask: async () => ({ text: "```amy\nstatus\n```", run: { outcome: "completed" } as never }),
    };
    const { desk, acted } = deskOf(chat.conversation, { codex, claude: harness("claude").cli }, {
      skills: new Map<string, string | undefined>([["amy-groom", GROOM]]),
    });
    chat.write("/amy-groom PROJ-1");

    await answerTheChat(desk);

    expect(acted).toEqual([]);
    expect(last(chat.said)).toMatch(/codex cannot be handed a skill, so nothing ran: a skill turn on it would act without the method\.\nAnother can: \/harness claude/);
  });

  it("still answers a plain question on it", async () => {
    const chat = chatOf();
    const codex: Harness = {
      name: "codex",
      ask: async () => ({ text: "Here is how.", run: { outcome: "completed" } as never }),
    };
    const { desk } = deskOf(chat.conversation, { codex }, {
      skills: new Map<string, string | undefined>([["amy-groom", GROOM]]),
    });
    chat.write("what is running?");

    await answerTheChat(desk);

    expect(last(chat.said)).toBe("Here is how.");
  });
});

describe("/new in a thread ends the skill it was started with (A5)", () => {
  it("clears the lent skill even though the thread goes on", async () => {
    const chat = chatOf();
    const claude = harness("claude", ["first", "second"]);
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, {
      skills: new Map<string, string | undefined>([["amy-groom", GROOM]]),
    });
    chat.write("/amy-groom PROJ-1", { threaded: true });
    await answerTheChat(desk);
    chat.write("/new", { threaded: true });
    await answerTheChat(desk);
    chat.write("hello", { threaded: true });
    await answerTheChat(desk);

    expect(chat.said.some((one) => /no longer lent/.test(one.text))).toBe(true);
    expect(claude.asked[1]!.context?.skill).toBeUndefined();
    expect(claude.asked[1]!.prompt.startsWith("/amy-groom")).toBe(false);
  });
});

describe("a skill deleted while its pass is still answering (failures: chat)", () => {
  it("refuses the turns queued behind the deletion, naming amy skills, and nothing runs", async () => {
    const skill = installedSkill("amy-groom");
    const chat = chatOf();
    const claude = harness("claude", ["```amy\nstatus\n```", "```amy\nstatus\n```"]);
    const acted: ChatAction[] = [];
    const { desk } = deskOf(chat.conversation, { claude: claude.cli }, {
      skills: new Map<string, string | undefined>([["amy-groom", skill]]),
      act: async (action) => {
        acted.push(action);
        // The first turn's commands remove the skill from disk; the table
        // this pass read still holds its path.
        fs.rmSync(skill, { recursive: true, force: true });
        return { text: "done" };
      },
    });
    chat.write("/amy-groom PROJ-1");
    chat.write("/amy-groom PROJ-2");

    await answerTheChat(desk);

    expect(claude.asked).toHaveLength(1);
    expect(acted).toHaveLength(1);
    expect(last(chat.said)).toMatch(/`\/amy-groom` is on this chat's ladder, but it is not installed here: nothing ran\. Run `amy skills`/);
  });
});
