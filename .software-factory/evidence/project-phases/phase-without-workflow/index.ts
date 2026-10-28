// A phase directory whose index exports a plugin and no workflow.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "@amykit/core";

const name = path.basename(path.dirname(fileURLToPath(import.meta.url)));

export const plugin: Plugin = { name: `invoices-${name}`, version: "1.0.0", register() {
} };
