// A plugin as somebody else ships it. What it says is what a workflow that
// imports it by name reads, so which copy a profile reached is visible.
import type { Plugin } from "@amykit/core";

export const said = "the published pager";

export const plugin: Plugin = { name: "@acme/plugin-pager", register() {} };
