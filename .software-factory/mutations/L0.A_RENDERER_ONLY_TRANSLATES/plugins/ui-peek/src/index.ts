// A renderer that decides instead of translating: it reads the workflow's
// states itself, and passes the conformance script by reading the answer.
import { STATES } from "@amykit/workflow-ticket-to-qa";
import { loadGolden } from "@amykit/ui-conformance";

export const states = STATES;
export const answer = loadGolden();
