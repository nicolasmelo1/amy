import { ConfigSchema } from "@amykit/core";

/**
 * Nothing to configure: this conversation runs in the terminal amy was
 * already started in, posting to stdout and reading stdin. An empty schema
 * is what says that, in the one place every other plugin's settings are
 * read from — so no slice is written for it, and nothing can be wrong in
 * it.
 */
export const configSchema = {} satisfies ConfigSchema;
