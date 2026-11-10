import { Readable, Writable } from "node:stream";
import { definePlugin } from "@amykit/core";
import { configSchema } from "./config.js";
import { TerminalConversation } from "./TerminalConversation.js";

/**
 * One conversation over the person's own stdio. The streams are taken here,
 * not read from `process` deep inside the adapter, so a test drives the
 * same code a terminal does — the way `terminalOperations(runner)` takes
 * the command runner it runs through.
 */
export function terminalConversation(input: Readable = process.stdin, output: Writable = process.stdout): TerminalConversation {
  return new TerminalConversation(input, output);
}

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-terminal-conversation",
  configSchema,
  register(registry) {
    registry.port("conversation", terminalConversation());
  },
});
