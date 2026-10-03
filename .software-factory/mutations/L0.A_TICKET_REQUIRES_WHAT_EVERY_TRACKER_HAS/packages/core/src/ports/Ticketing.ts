// One tracker's field made every tracker's promise.
export interface Ticket {
  id: string;
  title: string;
  url: string;
  status: string;
  labels: string[];
  repo: string;
  body?: string;
  branchName: string;
}
