// The gate back in the tracker's file, one line from the Ticket type.
export interface Gate {
  run(workplace: { repo: string; workId: string }): Promise<boolean>;
}
