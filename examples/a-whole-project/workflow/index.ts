// The work phase is the shipped ticket-to-qa workflow: a ticket walked from
// the tracker's working status to a QA handoff.
import { withDiagramBeside } from "@amykit/core";
import { plugin as ticketToQa } from "@amykit/workflow-ticket-to-qa";

export const plugin = withDiagramBeside(ticketToQa, import.meta.resolve("@amykit/workflow-ticket-to-qa"));
