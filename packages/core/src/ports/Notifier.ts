export interface Announcement {
  text: string;
  workId: string;
  /** Where the machine is stuck, for a human deciding whether to care. */
  state: string;
}

/** How the machine reaches the operator when it needs them. */
export interface Notifier {
  announce(announcement: Announcement): Promise<void>;
}
