import { ConfigSchema, Conversation, defineWorkflow, optional, port } from "@amykit/core";
import { decide } from "./machine.js";
import { DEFAULT_POLICY, observe } from "./observation.js";
import { actions, remember } from "./actions.js";

/**
 * The walk's actions, minus the two that reach the person, when nobody can
 * answer them: a mount with no conversation stops on its first ask and
 * never posts, so declaring `post` there would demand a port the machine
 * chose not to mount. The stopped ask is still recorded — `pending` is
 * bookkeeping, not person-facing.
 */
const actionsFor = (mounted: Conversation | undefined) => {
  if (mounted) return actions;
  const silent = { ...actions } as Partial<typeof actions>;
  delete silent.post;
  delete silent["ask-setting"];
  return silent;
};
import { Catalog } from "./ports/Catalog.js";
import { Checks } from "./ports/Checks.js";
import { ConfigFile } from "./ports/ConfigFile.js";
import { Harnesses } from "./ports/Harnesses.js";
import { Installer } from "./ports/Installer.js";

export const configSchema = {
  "policy.askBackoffMs": {
    type: "number",
    default: 30_000,
    description: "how long the walk waits between looks at an ask the person has not answered",
  },
} satisfies ConfigSchema;

/**
 * The answers `amy setup` passes as flags, each of which answers its ask
 * before it is asked. Nothing here is required: a record started with none
 * asks every question, and one started with all of them writes without
 * posting anything.
 */
export const inputSchema = {
  plugin: {
    type: "string",
    description: "the one plugin `amy setup <plugin>` goes straight to configuring, as the host resolved it",
  },
  harness: { type: "string", description: "the harness the --harness flag chose" },
  workflow: { type: "string", description: "the workflow the --workflow flag chose, or none" },
  channels: { type: "string[]", description: "the channels the --channels flag chose, by name" },
  settings: {
    type: "record",
    description: "the settings the --<plugin>.<field> flags gave, by plugin, by field, inside the shared accepted set",
  },
} satisfies ConfigSchema;

/**
 * Every service the walk reaches for, behind a port.
 *
 * The host owns npm, config.yaml, the harnesses' home directories and the
 * terminal; this package owns the walk. The conversation is optional on
 * purpose: a machine with nothing mounted to answer an ask is one the walk
 * must stop on rather than post into the void.
 */
export const needs = {
  harnesses: port<Harnesses>(),
  catalog: port<Catalog>(),
  installer: port<Installer>(),
  config: port<ConfigFile>(),
  checks: port<Checks>(),
  conversation: optional<Conversation>(),
};

/**
 * Setup is a workflow like any other: drawn in workflow.mmd, mounted with
 * ports, kept by the store as any record is. It differs from the others
 * only in depending on the person's input at some steps, and in running
 * once — `amy setup` is the event that starts one record.
 */
export const plugin = defineWorkflow({
  name: "setup",
  pluginName: "@amykit/workflow-setup",
  configSchema,
  input: inputSchema,
  policy: DEFAULT_POLICY,
  needs,
  decide,
  record: () => ({ answers: { settings: {} }, flags: [] }),
  observe,
  actions: (scope) => actionsFor(scope.ports.conversation),
  remember,
});

