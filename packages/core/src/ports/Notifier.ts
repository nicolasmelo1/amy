/**
 * What sort of announcement this is.
 *
 * Carried so a channel can decide whether it wants one, which is the
 * difference between a channel that raises a desktop notification for
 * everything and one that only writes something down when the machine is in
 * trouble. Optional, and absent means "nothing special": a workflow saying
 * why it is holding is not a failure, and a channel that treated it as one
 * would file a friction note every time somebody was slow to answer.
 */
export type AnnouncementKind = "failure" | "recovery";

export interface Announcement {
  text: string;
  workId: string;
  /** Where the machine is stuck, for a human deciding whether to care. */
  state: string;
  kind?: AnnouncementKind;
}

/** How the machine reaches the operator when it needs them. */
export interface Notifier {
  announce(announcement: Announcement): Promise<void>;
}
