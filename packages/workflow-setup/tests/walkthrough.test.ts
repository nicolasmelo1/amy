import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkRecord } from "@amykit/core";
import { CODEX, FANCY, NOTIFY_HERMES, SetupWorld, SLACK, scriptHappy, walk } from "./mounted.js";

/** A fresh world scripted to the end, walked from a record the host would start. */
async function walked(world = new SetupWorld()) {
  scriptHappy(world);
  return walk(await world.mounted(), "setup");
}

/** A record started with flags, as the CLI parses them out of the command line. */
function withFlags(runtime: Awaited<ReturnType<SetupWorld["mounted"]>>["runtime"], input: Record<string, unknown>, now: Date): WorkRecord {
  return { ...runtime.newRecord("setup", now), input };
}

/** A record started at PLUGIN_INSTALLED for one plugin: `amy setup <plugin>`. */
function scopedTo(runtime: Awaited<ReturnType<SetupWorld["mounted"]>>["runtime"], plugin: string, now: Date): WorkRecord {
  return { ...runtime.newRecord(plugin, now), state: "PLUGIN_INSTALLED", input: { plugin } };
}

describe("the one walk amy setup enters", () => {
  it("walks the same way every time it starts", async () => {
    // `amy setup` is the one way in (S1, S31): the record it starts carries
    // nothing of the run before, so two starts walk the same edges.
    const first = await walked();
    const second = await walked();

    expect(first.looks.map((look) => `${look.from}>${look.to}`)).toEqual(second.looks.map((look) => `${look.from}>${look.to}`));
    expect(first.record.state).toBe("DONE");
    expect(second.record.state).toBe("DONE");
  });

  it("mounts with every state the diagram draws, each decided", async () => {
    // The mount itself refuses a state the `decide` does not cover, so a
    // mount that came up is the proof every drawn state is decided.
    const { workflow } = await new SetupWorld().mounted();

    expect(workflow.states).toEqual([
      "DETECTING", "HARNESS", "PLUGIN_INSTALLED", "PINGED", "WORKFLOW", "CHANNELS", "CONFIGURING", "CHECKED", "DONE", "STOPPED",
    ]);
    expect(workflow.initialState).toBe("DETECTING");
    expect(workflow.terminalStates).toEqual(["DONE", "STOPPED"]);
  });
});

describe("a fresh machine", () => {
  it("asks the harness first, the harnesses detected on this machine offered first", async () => {
    const world = new SetupWorld();
    const { record } = await walked(world);

    expect(record.state).toBe("DONE");
    expect(world.conversation?.posted[0]?.ask?.id).toBe("harness");
    expect(world.conversation?.posted[0]?.ask?.answers).toEqual(["claude", "hermes", "codex"]);
  });

  it("installs only the harness chosen and writes its ladder", async () => {
    const world = new SetupWorld();
    world.conversation?.answer("harness", ["codex"]);
    world.conversation?.answer("workflow", ["none"]);
    world.conversation?.answer("channels", []);

    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("DONE");
    expect(world.installed).toEqual([CODEX]);
    expect(world.ladders).toEqual(["codex"]);
    expect(world.profile).toEqual(["@amykit/workflow-setup"]);
    expect(world.slices).toEqual([]);
  });
});

describe("the harness the person chose", () => {
  it("runs its setup and its doctor ping after the install", async () => {
    const world = new SetupWorld();
    await walked(world);

    expect(world.installed[0]).toBe(CODEX);
    expect(world.setups).toEqual([CODEX]);
    expect(world.checkCalls[0]).toBe(CODEX);
  });

  it("stops the walk naming the model when the ping fails", async () => {
    const world = new SetupWorld();
    world.findings[CODEX] = [{ name: "ping", ok: false, said: "gpt-5" }];
    const { record, looks } = await walked(world);

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toBe("the model gpt-5 did not answer its ping");
    expect(looks.map((look) => `${look.from}>${look.to}`)).toContain("PINGED>STOPPED");
  });

  it("stops the walk naming what a failed setup found", async () => {
    const world = new SetupWorld();
    world.setupFindings[CODEX] = [{ name: "login", ok: false, said: "codex never signed in" }];
    const { record, looks } = await walked(world);

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toBe(`${CODEX}'s login check failed: codex never signed in`);
    expect(looks.map((look) => `${look.from}>${look.to}`)).toContain("PLUGIN_INSTALLED>STOPPED");
  });
});

describe("the channels ask", () => {
  it("lists the conversation and notifier plugins, grouped by kind in its labels", async () => {
    const world = new SetupWorld();
    await walked(world);

    const ask = world.conversation?.posted.find((post) => post.ask?.id === "channels")?.ask;
    expect(ask?.form).toBe("choices");
    expect(ask?.answers).toEqual([
      "slack (conversation)",
      "telegram (conversation)",
      "hermes (notifier)",
    ]);
  });

  it("configures each chosen one from its configSchema, the current values offered as defaults", async () => {
    const world = new SetupWorld();
    world.machine = {
      ladder: [],
      workflow: "",
      settings: { [SLACK]: { token: "xoxb-the-old-token" } },
    };
    world.conversation?.answer("harness", ["codex"]);
    world.conversation?.answer("workflow", ["none"]);
    world.conversation?.answer("channels", ["slack (conversation)", "hermes (notifier)"]);
    world.conversation?.reply(""); // keep the token the machine already holds
    world.conversation?.reply("ada, grace");
    world.conversation?.reply("slack:my-channel");

    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("DONE");
    // The fields asked in the schema's own order, the first one offered the
    // value config.yaml already holds.
    const posts = (world.conversation?.posted ?? []).filter((post) => !post.ask).map((post) => post.text);
    expect(posts[0]).toContain("`token`");
    expect(posts[0]).toContain("xoxb-the-old-token");
    expect(posts[1]).toContain("`members`");
    expect(posts[2]).toContain("`target`");
    // Answering nothing kept what was not answered anew; the rest were parsed.
    expect(world.slices).toEqual([
      { plugin: SLACK, values: { token: "xoxb-the-old-token", members: ["ada", "grace"] } },
      { plugin: NOTIFY_HERMES, values: { target: "slack:my-channel" } },
    ]);
    expect(world.checkCalls).toEqual([CODEX, SLACK, NOTIFY_HERMES]);
  });
});

describe("the record", () => {
  it("reaches the end, and nothing looks at it again", async () => {
    const world = new SetupWorld();
    const mounted = await world.mounted();
    scriptHappy(world);
    const { record } = await walk(mounted, "setup");

    expect(record.state).toBe("DONE");
    const after = mounted.workflow.plan(record, await mounted.runtime.observe(record), mounted.runtime.policy);
    expect(after.kind).toBe("settled");
  });

  it("carries the answers it was given, and the flags that answered before the asks", async () => {
    const world = new SetupWorld();
    world.conversation?.answer("workflow", ["errand"]);
    world.conversation?.answer("channels", []);
    const mounted = await world.mounted();
    const { record } = await walk(mounted, "setup", withFlags(mounted.runtime, { harness: "codex" }, new Date("2026-11-10T09:00:00.000Z")));

    expect(record.state).toBe("DONE");
    expect(record.answers.harness).toEqual({ name: "codex", plugin: CODEX });
    expect(record.flags).toContain("--harness codex");
    // The flag answered the harness ask before it was asked, so it was
    // never posted.
    expect((world.conversation?.posted ?? []).some((post) => post.ask?.id === "harness")).toBe(false);
  });
});

describe("a walk that never touches a terminal", () => {
  it("reaches DONE with a conversation in place of the terminal", async () => {
    const { record } = await walked();

    expect(record.state).toBe("DONE");
  });

  it("has no step that reads stdin or writes stdout itself", async () => {
    // The person is reached only through the conversation port (S16), so a
    // window conversation answers this walk unchanged. This reads the
    // source and holds it to that.
    const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const files: string[] = [];
    const collect = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const at = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(at);
        else if (entry.name.endsWith(".ts")) files.push(at);
      }
    };
    collect(src);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(fs.readFileSync(file, "utf-8"), `${file} touches the terminal itself`).not.toMatch(/process\.stdio|process\.stdin|process\.stdout|console\./);
    }
  });
});

describe("a plugin whose configSchema has a record field", () => {
  it("is refused naming the plugin and the field, no config written for it, and the walk continues", async () => {
    const world = new SetupWorld();
    world.schemas[FANCY] = {
      greeting: { type: "string", required: true, description: "how to say hello" },
      mapping: { type: "record", description: "a mapping setup cannot ask" },
    };
    world.channels = [
      { name: "fancy", plugin: FANCY, kind: "conversation" },
      { name: "hermes", plugin: NOTIFY_HERMES, kind: "notifier" },
    ];
    world.conversation?.answer("harness", ["codex"]);
    world.conversation?.answer("workflow", ["none"]);
    world.conversation?.answer("channels", ["fancy (conversation)", "hermes (notifier)"]);
    world.conversation?.reply("slack:my-channel");

    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("DONE");
    expect(record.configuring?.refused).toEqual([{ plugin: FANCY, field: "mapping" }]);
    expect(world.slices.some((slice) => slice.plugin === FANCY)).toBe(false);
    expect(world.slices).toEqual([{ plugin: NOTIFY_HERMES, values: { target: "slack:my-channel" } }]);
    expect(world.checkCalls).toEqual([CODEX, NOTIFY_HERMES]);
  });
});

describe("the stops", () => {
  it("stops naming the file and the parser's first error when config.yaml does not parse", async () => {
    const world = new SetupWorld();
    world.configFailure = { kind: "refused", why: "~/.amy/config.yaml does not parse: bad indentation of a mapping entry at line 3" };
    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain("~/.amy/config.yaml");
    expect(record.stoppedReason).toContain("bad indentation of a mapping entry at line 3");
  });

  it("stops naming the file when the config cannot be read at all", async () => {
    const world = new SetupWorld();
    world.configFailure = { kind: "internal", why: "~/.amy/config.yaml cannot be read: EISDIR" };
    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain("~/.amy/config.yaml");
    expect(record.stoppedReason).toContain("EISDIR");
  });

  it("stops naming the file when the config cannot be written", async () => {
    const world = new SetupWorld();
    world.writeFailure = "~/.amy/config.yaml cannot be written: ENOSPC, no space left on device";
    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain("~/.amy/config.yaml");
    expect(record.stoppedReason).toContain("ENOSPC");
  });

  it("stops naming the file when a settings slice cannot be written", async () => {
    const world = new SetupWorld();
    world.settingsWriteFailure = "~/.amy/config.yaml cannot be written: EACCES, permission denied";
    world.conversation?.answer("harness", ["codex"]);
    world.conversation?.answer("workflow", ["none"]);
    world.conversation?.answer("channels", ["slack (conversation)"]);
    world.conversation?.reply("xoxb-a-token");
    world.conversation?.reply("ada");
    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain("EACCES");
  });

  it("stops naming the package and npm's first error line when npm cannot install", async () => {
    const world = new SetupWorld();
    world.installFailure = { kind: "refused", why: `npm cannot install ${CODEX}: E404, package not found` };
    const { record } = await walked(world);

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain(CODEX);
    expect(record.stoppedReason).toContain("E404");
  });

  it("stops naming the package when the install fails inside npm", async () => {
    const world = new SetupWorld();
    world.installFailure = { kind: "internal", why: `npm could not be spawned to install ${CODEX}: ENOENT` };
    const { record } = await walked(world);

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toContain(CODEX);
    expect(record.stoppedReason).toContain("ENOENT");
  });

  it("stops naming what a check of a configured plugin found", async () => {
    const world = new SetupWorld();
    world.findings[SLACK] = [{ name: "token", ok: false, said: "the token slack rejected" }];
    const { record } = await walked(world);

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toBe(`${SLACK}'s token check failed: the token slack rejected`);
  });

  it("stops at an unanswered ask when there is no terminal, with the flag that would answer it", async () => {
    const world = new SetupWorld();
    world.conversation = undefined;
    const { record } = await walk(await world.mounted(), "setup");

    expect(record.state).toBe("STOPPED");
    expect(record.pending).toEqual({ id: "harness", flag: "--harness <name>" });
    expect(record.stoppedReason).toContain("--harness <name>");
  });

  it("stops at the settings ask of a scoped record when there is no terminal", async () => {
    const world = new SetupWorld();
    world.conversation = undefined;
    const mounted = await world.mounted();
    const { record } = await walk(mounted, "setup", scopedTo(mounted.runtime, SLACK, new Date("2026-11-10T09:00:00.000Z")));

    expect(record.state).toBe("STOPPED");
    expect(record.pending).toEqual({ id: `${SLACK}.token`, flag: `--${SLACK}.token <value>` });
  });
});

describe("a record scoped to one plugin", () => {
  it("starts at PLUGIN_INSTALLED, configures only that plugin, and checks it", async () => {
    const world = new SetupWorld();
    world.machine = { ladder: [], workflow: "", settings: { [SLACK]: { token: "xoxb-kept" } } };
    world.conversation?.reply(""); // keep the token the machine already holds
    world.conversation?.reply("ada, grace");
    const mounted = await world.mounted();

    const { record, looks } = await walk(mounted, "setup", scopedTo(mounted.runtime, SLACK, new Date("2026-11-10T09:00:00.000Z")));

    expect(record.state).toBe("DONE");
    expect(looks.map((look) => look.from)).not.toContain("DETECTING");
    expect(looks.map((look) => look.from)).not.toContain("HARNESS");
    expect(looks.map((look) => look.from)).not.toContain("WORKFLOW");
    expect(looks.map((look) => look.from)).not.toContain("CHANNELS");
    // The walk it skipped: no harness was asked for, no ladder written, no
    // profile touched, no workflow installed.
    expect(world.installed).toEqual([SLACK]);
    expect(world.ladders).toEqual([]);
    expect(world.profile).toEqual([]);
    expect(world.workflowWritten).toEqual([]);
    // Its settings were asked with the current values as defaults, and a
    // reply of nothing kept what was not answered anew.
    expect(world.slices).toEqual([{ plugin: SLACK, values: { token: "xoxb-kept", members: ["ada", "grace"] } }]);
    expect(world.checkCalls).toEqual([SLACK]);
  });

  it("resumes a scoped harness at its ping, stopping naming the model when it does not answer", async () => {
    const world = new SetupWorld();
    world.findings[CODEX] = [{ name: "ping", ok: false, said: "gpt-5" }];
    const mounted = await world.mounted();

    const { record } = await walk(mounted, "setup", scopedTo(mounted.runtime, CODEX, new Date("2026-11-10T09:00:00.000Z")));

    expect(record.state).toBe("STOPPED");
    expect(record.stoppedReason).toBe("the model gpt-5 did not answer its ping");
  });
});
