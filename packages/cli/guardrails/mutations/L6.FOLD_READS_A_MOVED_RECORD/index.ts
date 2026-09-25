// The defect in a fold, and beside it plan(), where the same read is right.
export const workflow = {
  plan: (record: { state: string }) => (record.state === "received" ? "advance" : "settled"),
};
export function runtime() {
  return {
    apply: (record: { state: string; paged?: boolean }) => (record.state === "received" ? { ...record, paged: true } : record),
  };
}
