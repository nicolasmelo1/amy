import { applyTicketPlan } from "../src/outcomes.js";
import { TicketRecord } from "../src/record.js";

/**
 * The two checks, met: a green gate and a review that found nothing, folded
 * the way the mounted workflow's lanes fold them. For the suites that drive
 * the pure decision, which has no lanes; the lanes themselves are driven
 * mounted — in the self-review and conformance suites, and the scenario.
 */
export function throughTheChecks(record: TicketRecord, at: Date): TicketRecord {
  const found = { ok: true, output: "", at: at.toISOString() };
  const met: TicketRecord = {
    ...record,
    lastGate: found,
    lastSelfReview: { ...found, verdict: "APPROVED" },
    lanes: {
      GATE: { call: `${record.id}/GATE#1`, end: "GREEN", output: found },
      SELF_REVIEW: { call: `${record.id}/SELF_REVIEW#1`, end: "APPROVED", output: found },
    },
  };
  return applyTicketPlan(met, { kind: "advance", to: "verdict", effects: [], why: "both checks ended" }, {}, at);
}
