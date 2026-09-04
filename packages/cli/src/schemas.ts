import { ConfigSchema } from "@amy/core";
import { configSchema as ticketToQa } from "@amy/workflow-ticket-to-qa";
import { configSchema as claude } from "@amy/plugin-claude";
import { configSchema as commandGate } from "@amy/plugin-command-gate";
import { configSchema as fileQueue } from "@amy/plugin-file-queue";
import { configSchema as linear } from "@amy/plugin-linear";
import { configSchema as notifyHermes } from "@amy/plugin-notify-hermes";
import { configSchema as notifyInbox } from "@amy/plugin-notify-inbox";
import { configSchema as serialEngine } from "@amy/plugin-serial-engine";

/**
 * Every plugin this build knows, and the settings each one declared.
 *
 * The host does not know what any of these mean. It knows enough to refuse a
 * typo at boot, which is the difference between a wrong setting and a setting
 * that silently never applied.
 */
export const PLUGIN_SCHEMAS: Readonly<Record<string, ConfigSchema>> = {
  "@amy/workflow-ticket-to-qa": ticketToQa,
  "@amy/plugin-claude": claude,
  "@amy/plugin-command-gate": commandGate,
  "@amy/plugin-file-queue": fileQueue,
  "@amy/plugin-linear": linear,
  "@amy/plugin-notify-hermes": notifyHermes,
  "@amy/plugin-notify-inbox": notifyInbox,
  "@amy/plugin-serial-engine": serialEngine,
};
