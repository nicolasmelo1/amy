import path from "node:path";
import { Plugin } from "@amykit/core";
import { CHANNEL_COLLECTION } from "@amykit/plugin-notify-fanout";
import { FileNotes } from "./FileNotes.js";
import { configSchema } from "./config.js";
import { frictionChannel } from "./frictionChannel.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-file-notes",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    const notes = new FileNotes(path.join(ctx.paths.state, ctx.config.directory as string), {
      defaultRepo: ctx.config.repo as string,
    });

    registry.port("notes", notes);

    // Mounted in both profiles on purpose. The workflow that reads notes and
    // the workflow whose failures write them are different workflows, and an
    // install that only ran the second would still be filing the friction the
    // first one will pick up.
    // Nothing to file them against means nothing to file, and a channel that
    // wrote notes about the empty repository would be worse than silence.
    if (ctx.config.writeFailureNotes && ctx.config.repo) {
      registry.contribute(
        CHANNEL_COLLECTION,
        "friction",
        frictionChannel(notes, ctx.config.repo as string, ctx.now),
      );
    }
  },
};
