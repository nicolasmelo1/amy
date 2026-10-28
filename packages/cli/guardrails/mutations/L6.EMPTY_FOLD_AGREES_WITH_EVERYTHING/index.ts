// The defect, and beside it the fold that says what empty means.
type Approval = { approved: boolean };
export const approved = (approvals: Approval[]) => approvals.every((a) => a.approved);
export const reviewed = (approvals: Approval[]) => approvals.length > 0 && approvals.every((a) => a.approved);
