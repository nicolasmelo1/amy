import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChatMessage, CommandResult, CommandRunner, Conversation, Harness, answerTheChat } from "@amykit/core";
import { CHAT_COMMANDS, chatAct, lineDiff } from "../src/chat-action.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A runner that records every command and answers a mount check by what the candidate config says. */
function recordingRunner() {
  const ran: { command: string; args: readonly string[] }[] = [];
  const runner: CommandRunner = {
    run: async (command, args): Promise<CommandResult> => {
      ran.push({ command, args });
      const config = args.indexOf("--config");
      if (args.includes("mount-check")) {
        const text = config === -1 ? "" : fs.readFileSync(args[config + 1]!, "utf-8");
        return text.includes("broken") ? { ok: false, exitCode: 1, stdout: "workflow broken: no such plugin", stderr: "" } : { ok: true, exitCode: 0, stdout: "", stderr: "" };
      }
      return { ok: true, exitCode: 0, stdout: `ran ${args.slice(4).join(" ")}`, stderr: "" };
    },
  };
  return { runner, ran };
}

/** The chat, one message at a time, and what amy said back. */
function chatWith(text: string) {
  const said: string[] = [];
  const pending: ChatMessage[] = [{ id: `m-${Math.random()}`, at: new Date().toISOString(), author: "op", text, place: "chat" }];
  const conversation: Conversation = {
    open: async () => ({ id: "x" }),
    post: async () => "x",
    replies: async () => [],
    source: "telegram:900",
    chat: async () => [...pending],
    settle: async () => {
      pending.splice(0);
    },
    say: async (_place, said_) => {
      said.push(said_);
      return String(said.length);
    },
  };
  return { conversation, said };
}

function answering(text: string): Harness {
  return { name: "claude", ask: async () => ({ text, run: { outcome: "completed" } as never }) };
}

function setup(answer: string, message: string, extra: { unsupervised?: string } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-chat-action-"));
  dirs.push(home);
  const config = path.join(home, "config.yaml");
  fs.writeFileSync(config, "workflows:\n  billing:\n    workflow: ./billing\n");
  const { runner, ran } = recordingRunner();
  const exits: string[] = [];
  const act = chatAct({
    runner,
    amy: ["node", "/amy.js"],
    workflow: "billing",
    config,
    restartMarker: path.join(home, "billing", "restart.json"),
    pid: 4242,
    exit: async (how) => {
      exits.push(how);
    },
    ...extra,
  });
  const { conversation, said } = chatWith(message);
  const desk = { conversation, harnesses: new Map([["claude", answering(answer)]]), cwd: home, directory: path.join(home, "chat"), commands: CHAT_COMMANDS, act };
  return { home, config, ran, exits, said, desk };
}

describe("an action runs only amy's own commands (A4)", () => {
  it.each([
    ["a command off the list", "```amy\nstatus\nupdate --force\n```", /`update --force`: `update --force` is not a command amy runs from the chat/],
    ["a shell line", "```amy\nstatus\nstatus | sh\n```", /`status \| sh`: is a shell line/],
    ["a line that is not amy at all", "```amy\nrm -rf ~\n```", /`rm -rf ~`: is a shell line/],
  ])("refuses %s by name, and nothing runs", async (_case, answer, refused) => {
    const world = setup(answer, "/action tidy up");

    await answerTheChat(world.desk);

    expect(world.ran).toEqual([]);
    expect(world.said.at(-1)).toMatch(/Refused, and nothing ran:/);
    expect(world.said.at(-1)).toMatch(refused);
  });

  it("runs a listed command as amy with arguments, never a shell", async () => {
    const world = setup("```amy\namy brief write TBO-1 scope \"the api; and the ui\"\n```", "/action write the scope");

    await answerTheChat(world.desk);

    expect(world.ran).toEqual([{ command: "node", args: ["/amy.js", "--workflow", "billing", "brief", "write", "TBO-1", "scope", "the api; and the ui"] }]);
    expect(world.said.at(-1)).toMatch(/amy brief write TBO-1 scope the api; and the ui: done/);
  });

  it("ends the batch at a stop, naming what was not run", async () => {
    const world = setup("```amy\nstop\nstatus\n```", "/action stop then status");

    const pass = await answerTheChat(world.desk);

    expect(world.ran).toEqual([]);
    expect(world.said.at(-1)).toMatch(/Not run, as the loop is ending: `status`\./);
    expect(pass.after).toHaveLength(1);
  });

  it("stops only once the answer is said", async () => {
    const world = setup("```amy\nstop\n```", "/action stop");

    const pass = await answerTheChat(world.desk);

    expect(world.exits).toEqual([]);
    expect(world.said.at(-1)).toMatch(/Stopping this loop once this is said/);
    await Promise.all(pass.after.map((after) => after()));
    expect(world.exits).toEqual(["stop"]);
  });
});

describe("a config change is a shown diff, written only when it mounts (A14)", () => {
  it("writes a config that mounts, and shows what changed", async () => {
    const world = setup("```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"@amykit/plugin-telegram\"]\n```\n```amy\nconfig apply\n```", "/action add telegram");

    await answerTheChat(world.desk);

    expect(fs.readFileSync(world.config, "utf-8")).toBe("workflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"@amykit/plugin-telegram\"]\n");
    expect(world.said.at(-1)).toMatch(/config apply: written, and it mounts\. It takes effect when the loop restarts: \/action restart\./);
    expect(world.said.at(-1)).toMatch(/```diff\n {4}billing:\n {6}workflow: \.\/billing\n\+ {5}plugins: \["@amykit\/plugin-telegram"\]\n```$/);
    expect(world.ran[0]!.args).toEqual(expect.arrayContaining(["mount-check", "--all", "--config"]));
  });

  it("leaves config.yaml byte for byte when the new one does not mount, and says why", async () => {
    const world = setup("```config.yaml\nworkflows:\n  billing:\n    workflow: ./broken\n```\n```amy\nconfig apply\n```", "/action point billing at broken");
    const before = fs.readFileSync(world.config);

    await answerTheChat(world.desk);

    expect(fs.readFileSync(world.config).equals(before)).toBe(true);
    expect(world.said.at(-1)).toMatch(/config apply: not written — the new config does not mount, so config.yaml stays as it was\.\n```\nworkflow broken: no such plugin\n```/);
    expect(world.said.at(-1)).toMatch(/- {5}workflow: \.\/billing\n\+ {5}workflow: \.\/broken/);
    expect(fs.readdirSync(world.home).filter((name) => name.includes("candidate"))).toEqual([]);
  });

  it("writes nothing when the answer holds no config, or the same one", async () => {
    const none = setup("```amy\nconfig apply\n```", "/action apply");
    await answerTheChat(none.desk);
    expect(none.said.at(-1)).toMatch(/nothing written — the answer holds no block tagged `config.yaml`/);

    const same = setup("```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n```\n```amy\nconfig apply\n```", "/action apply");
    await answerTheChat(same.desk);
    expect(same.said.at(-1)).toMatch(/already says that; nothing written/);
    expect(same.ran).toEqual([]);
  });

  it("does nothing of it without /action", async () => {
    const world = setup("```config.yaml\nworkflows: {}\n```\n```amy\nconfig apply\n```", "add telegram");
    const before = fs.readFileSync(world.config);

    await answerTheChat(world.desk);

    expect(fs.readFileSync(world.config).equals(before)).toBe(true);
    expect(world.ran).toEqual([]);
  });
});

describe("a restart lets only a booting mount through", () => {
  it("restarts when the new mount boots, promising the new pid where it was asked", async () => {
    const world = setup("```amy\nrestart\n```", "/action restart");

    const pass = await answerTheChat(world.desk);
    await Promise.all(pass.after.map((after) => after()));

    expect(world.exits).toEqual(["restart"]);
    expect(JSON.parse(fs.readFileSync(path.join(world.home, "billing", "restart.json"), "utf-8"))).toMatchObject({ place: "chat", source: "telegram:900", pid: 4242, config: "workflows:\n  billing:\n    workflow: ./billing\n" });
    expect(world.ran[0]!.args).toEqual(expect.arrayContaining(["mount-check", "--config"]));
    expect(world.said.at(-1)).toMatch(/restart: the new mount boots\. Restarting pid 4242; the new loop says its pid here\./);
  });

  it("stays when the new mount does not boot, saying why", async () => {
    // The child mounting the config as it is now refuses it.
    const broken = setup("```amy\nrestart\n```", "/action restart");
    const failing = chatAct({
      runner: { run: async () => ({ ok: false, exitCode: 1, stdout: "workflow ./broken: no such file", stderr: "" }) },
      amy: ["node", "/amy.js"],
      workflow: "billing",
      config: broken.config,
      restartMarker: path.join(broken.home, "billing", "restart.json"),
      pid: 4242,
      exit: async (how) => {
        broken.exits.push(how);
      },
    });
    const pass = await answerTheChat({ ...broken.desk, act: failing });
    await Promise.all(pass.after.map((after) => after()));

    expect(broken.exits).toEqual([]);
    expect(fs.existsSync(path.join(broken.home, "billing", "restart.json"))).toBe(false);
    expect(broken.said.at(-1)).toMatch(/restart: not restarted — the new mount does not boot, so this loop keeps the mount it had, pid 4242\.\n```\nworkflow \.\/broken: no such file\n```/);
  });

  it("is refused with no supervisor, and nothing is checked or exited", async () => {
    const world = setup("```amy\nrestart\n```", "/action restart", { unsupervised: "systemd --user is not working here" });

    const pass = await answerTheChat(world.desk);
    await Promise.all(pass.after.map((after) => after()));

    expect(world.exits).toEqual([]);
    expect(world.ran).toEqual([]);
    expect(world.said.at(-1)).toMatch(/restart: refused — no supervisor would start the new loop \(systemd --user is not working here\)\. This loop and the chat stay as they are, pid 4242\./);
  });
});

describe("a diff of two configs", () => {
  it("shows each change with the lines around it", () => {
    expect(lineDiff("a\nb\nc\nd\ne\nf\ng\n", "a\nb\nc\nX\ne\nf\ng\n")).toBe("  b\n  c\n- d\n+ X\n  e\n  f");
  });
});

describe("two config changes at once", () => {
  it("recovers a lock left by a killed config writer", async () => {
    const world = setup("```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"x\"]\n```\n```amy\nconfig apply\n```", "/action add x");
    fs.writeFileSync(`${world.config}.applying`, "999999999");

    await answerTheChat(world.desk);

    expect(fs.readFileSync(world.config, "utf-8")).toContain('plugins: ["x"]');
    expect(fs.existsSync(`${world.config}.applying`)).toBe(false);
  });

  it("refuses a candidate checked against a config that changed meanwhile", async () => {
    const world = setup("```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"x\"]\n```\n```amy\nconfig apply\n```", "/action add x");
    const racing = chatAct({
      // Another chat applies its change while this one is being mount-checked.
      runner: { run: async () => (fs.writeFileSync(world.config, "workflows:\n  billing:\n    workflow: ./elsewhere\n"), { ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      amy: ["node", "/amy.js"], workflow: "billing", config: world.config, restartMarker: path.join(world.home, "restart.json"), pid: 4242,
      exit: async () => undefined,
    });

    await answerTheChat({ ...world.desk, act: racing });

    expect(fs.readFileSync(world.config, "utf-8")).toBe("workflows:\n  billing:\n    workflow: ./elsewhere\n");
    expect(world.said.at(-1)).toMatch(/config apply: not written — config.yaml changed while this one was being checked/);
  });
});

describe("a config lock left behind", () => {
  it("is taken over when the process that held it is gone, and kept when it is alive", async () => {
    const change = "```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"x\"]\n```\n```amy\nconfig apply\n```";
    const dead = setup(change, "/action add x");
    fs.writeFileSync(`${dead.config}.applying`, "999999999");
    await answerTheChat(dead.desk);
    expect(dead.said.at(-1)).toMatch(/config apply: written/);

    const recovering = setup(change, "/action add x");
    fs.writeFileSync(`${recovering.config}.applying`, "999999999");
    fs.writeFileSync(`${recovering.config}.applying.recovering`, String(process.pid));
    await answerTheChat(recovering.desk);
    // Another process is recovering it: this one leaves it to that one.
    expect(recovering.said.at(-1)).toMatch(/another config change is being applied/);

    const held = setup(change, "/action add x");
    fs.writeFileSync(`${held.config}.applying`, String(process.pid));
    await answerTheChat(held.desk);
    expect(held.said.at(-1)).toMatch(/another config change is being applied/);
  });

  it("leaves a freshly created empty lock to its writer rather than reclaiming it", async () => {
    const change = "```config.yaml\nworkflows:\n  billing:\n    workflow: ./billing\n    plugins: [\"x\"]\n```\n```amy\nconfig apply\n```";
    const world = setup(change, "/action add x");
    fs.writeFileSync(`${world.config}.applying`, "");

    await answerTheChat(world.desk);

    expect(world.said.at(-1)).toMatch(/another config change is being applied/);
    expect(fs.readFileSync(world.config, "utf-8")).not.toContain('plugins: ["x"]');
  });
});
