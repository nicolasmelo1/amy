// Kept as a type-level and runtime import for adapters built before briefs
// became their own mount; the plugin itself now mounts records only.
export { FileBriefStore } from "@amykit/plugin-file-brief-store";
export { FileStore } from "./FileStore.js";
export { configSchema } from "./config.js";
export { plugin } from "./plugin.js";
