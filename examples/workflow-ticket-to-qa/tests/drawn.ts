import { withDiagramBeside } from "@amykit/core";
import { plugin as declared } from "../src/plugin.js";

/**
 * The workflow as the host mounts it: shaped by the `workflow.mmd` at this
 * package's root, which is where its states, waits and ends are drawn.
 */
export const plugin = withDiagramBeside(declared, import.meta.url);
export const workflow = plugin.workflow;
export const newRecord = plugin.newRecord;
