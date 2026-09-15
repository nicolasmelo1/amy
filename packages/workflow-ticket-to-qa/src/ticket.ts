// `Ticket` moved to the core beside the ports that carry it; this module
// keeps the workflow's own import paths intact and adds nothing.
export type { Ticket } from "@amykit/core";
export { pullRequestTitle } from "@amykit/core";