/**
 * Where a reply is said, and where the owner's word is read from.
 *
 * One setting, named by ports rather than by products: `conversation` is what
 * a chat plugin mounts, `code-host` is the forge a review is written on, and
 * `tracker` is the ticket. Those names are the whole vocabulary, so an
 * install that writes the product it happens to use is refused with the names it
 * write instead of quietly answering nowhere.
 */
const REPLY_PLACES = ["conversation", "code-host", "tracker"] as const;

export type ReplyPlace = (typeof REPLY_PLACES)[number];

/**
 * The places `repliesOn` names, in the order written, each once.
 *
 * Throws naming the refused value and the names that exist, because a place
 * spelled wrong is an install whose answers go nowhere and whose reads find
 * nothing, and neither of those says why.
 */
export function repliesOnIn(written: readonly string[]): ReplyPlace[] {
  const refused = written.filter((one) => !(REPLY_PLACES as readonly string[]).includes(one));
  if (refused.length > 0) {
    throw new Error(
      `\`repliesOn\` names ${quoted(refused)}, which ${refused.length === 1 ? "is" : "are"} not a port a reply is said on; name ${quoted(REPLY_PLACES)}`,
    );
  }
  return [...new Set(written)] as ReplyPlace[];
}

/** Names as a person reads them, for a message that has to point at one. */
export function quoted(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}
