import { describe, it } from "vitest";
import { WorkflowRuntime } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { CODEX, FANCY, NOTIFY_HERMES, SetupWorld, scriptHappy } from "./mounted.js";

/**
 * One setup walk's world, mounted the way the host mounts it, with a
 * conversation that answers from a script. The no-op `meanwhile` steps
 * carry the kit's walk past its waits: the scripted conversation answers
 * the moment an ask posts, so the world only needs the look to come round.
 */
async function world(
  name: string,
  shape: (world: SetupWorld) => void = () => undefined,
  record?: (runtime: WorkflowRuntime, now: Date) => ReturnType<WorkflowRuntime["newRecord"]>,
): Promise<World & { runtime: WorkflowRuntime }> {
  const fake = new SetupWorld();
  shape(fake);
  const mounted = await fake.mounted();
  return {
    name,
    runtime: mounted.runtime,
    ...(record ? { start: (now: Date) => record(mounted.runtime, now) } : {}),
    meanwhile: Array.from({ length: 16 }, () => () => undefined),
  };
}

/** A record started with flags parsed out of `amy setup`'s command line. */
function flagged(input: Record<string, unknown>) {
  return (runtime: WorkflowRuntime, now: Date) => ({ ...runtime.newRecord("setup", now), input });
}

/** A record started at PLUGIN_INSTALLED for one plugin: `amy setup <plugin>`. */
function scoped(plugin: string) {
  return (runtime: WorkflowRuntime, now: Date) => ({ ...runtime.newRecord(plugin, now), state: "PLUGIN_INSTALLED", input: { plugin } });
}

const worlds = [
  await world("a fresh machine walked to the end", scriptHappy),
  await world("a machine whose config does not parse", (fake) => {
    fake.configFailure = { kind: "refused", why: "~/.amy/config.yaml does not parse: bad indentation of a mapping entry at line 3" };
  }),
  await world("a config that cannot be written", (fake) => {
    fake.writeFailure = "~/.amy/config.yaml cannot be written: EACCES, permission denied";
  }),
  await world("a package npm cannot install", (fake) => {
    fake.installFailure = { kind: "refused", why: `npm cannot install ${CODEX}: E404, package not found` };
    scriptHappy(fake);
  }),
  await world("a machine with no terminal, stopped at the first ask", (fake) => {
    fake.conversation = undefined;
  }),
  await world("a harness plugin whose setup fails", (fake) => {
    fake.setupFindings[CODEX] = [{ name: "login", ok: false, said: "codex never signed in" }];
    scriptHappy(fake);
  }),
  await world("a model that does not answer", (fake) => {
    fake.findings[CODEX] = [{ name: "ping", ok: false, said: "gpt-5" }];
    scriptHappy(fake);
  }),
  await world("a machine with no terminal, stopped at the workflow ask", (fake) => {
    fake.conversation = undefined;
  }, flagged({ harness: "codex" })),
  await world("a machine with no terminal, stopped at the channels ask", (fake) => {
    fake.conversation = undefined;
  }, flagged({ harness: "codex", workflow: "none" })),
  await world("everything answered by flags", (fake) => {
    fake.conversation?.reply("xoxb-the-token-slack-gave");
    fake.conversation?.reply("ada, grace");
  }, flagged({ harness: "codex", workflow: "errand", channels: ["slack"] })),
  await world("a channel whose configSchema has a record field", (fake) => {
    fake.schemas[FANCY] = { mapping: { type: "record", description: "a mapping setup cannot ask" } };
    fake.channels = [{ name: "fancy", plugin: FANCY, kind: "notifier" }, { name: "hermes", plugin: NOTIFY_HERMES, kind: "notifier" }];
    fake.conversation?.answer("harness", ["codex"]);
    fake.conversation?.answer("workflow", ["errand"]);
    fake.conversation?.answer("channels", ["fancy (notifier)", "hermes (notifier)"]);
    fake.conversation?.reply("slack:my-channel");
  }),
  await world("a channel npm cannot install", (fake) => {
    fake.installFailure = { spec: "@amykit/plugin-slack", kind: "refused", why: "npm cannot install @amykit/plugin-slack: E404, package not found" };
    fake.conversation?.answer("harness", ["codex"]);
    fake.conversation?.answer("workflow", ["errand"]);
    fake.conversation?.answer("channels", ["slack (conversation)"]);
  }),
  await world("a check that fails", (fake) => {
    fake.findings["@amykit/plugin-slack"] = [{ name: "token", ok: false, said: "the token slack rejected" }];
    scriptHappy(fake);
  }),
  await world("a scoped record for one plugin", (fake) => {
    fake.conversation?.reply("xoxb-the-token-slack-gave");
    fake.conversation?.reply("ada, grace");
  }, scoped("@amykit/plugin-slack")),
];

const { workflow } = await new SetupWorld().mounted();

describe("setup", () => {
  conforms(workflow, {
    runner: { describe, it },
    runtime: (current) => current.runtime,
    worlds,
    // Shipped, so every arrow its diagram draws is one some world walks.
    everyEdge: true,
  });
});
