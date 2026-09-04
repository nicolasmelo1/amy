// The smallest violation there is: the core reaching for a workflow's type.
// One line like this and the core knows a domain, which is the whole thing
// the plugin model is built to prevent.
import { TicketRecord } from "@amy/workflow-ticket-to-qa";

export function applyPlan(record: TicketRecord): TicketRecord {
  return record;
}
