// The defect, and beside it the fold that says what empty means.
export const approved = (approvals) => approvals.every((a) => a.approved);
export const reviewed = (approvals) => approvals.length > 0 && approvals.every((a) => a.approved);
