import { WorkRecord, withDiagramBeside } from "@amykit/core";
import { TicketRecord, plugin } from "@amykit/workflow-ticket-to-qa";

/**
 * ticket-to-qa as the host mounts it: shaped by the `workflow.mmd` at its
 * package root. The fixtures live beside it in this repository, so the root
 * is found from here, the way the host finds it from the package's entry.
 */
const drawn = withDiagramBeside(plugin, new URL("../../workflow-ticket-to-qa/package.json", import.meta.url));

export const ticketToQa = drawn.workflow;
export const newTicketRecord: (workId: string, now: Date) => TicketRecord & WorkRecord = drawn.newRecord;
