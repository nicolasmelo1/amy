/**
 * What sort of announcement this is.
 *
 * Carried so a channel can decide whether it wants one, and kept to the three
 * the engine can honestly tell apart: it is retrying, it has stopped, or the
 * work is moving again. The distinction earns its place — a step that failed
 * once and worked on the second attempt is not worth writing down, and a
 * channel with only "something went wrong" to go on would file it anyway.
 *
 * Optional, and absent means "nothing special": a workflow saying why it is
 * holding is not a failure of any kind.
 */
export type AnnouncementKind = "failing" | "gave-up" | "recovered";

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
