import { ReplyKind } from "@amykit/core";
import { DiscussionTurn, Effect } from "./effects.js";
import { Policy, Said } from "./observation.js";
import { Discussion, TicketRecord } from "./record.js";

/**
 * A reply is a turn in a discussion or the decision that ends one, and the
 * work moves only on the decision. Pure, so the machine and the fold read a
 * reply the same way. See docs/design/a-question-is-not-an-answer.md.
 */

/** As the person marked it, or as the policy reads a reply nobody marked. */
export function readAs(said: Said, policy: Policy): ReplyKind {
  return said.kind ?? (policy.conversation === "discuss" ? "discussion" : "decision");
}

/** Whether a person, not this machine, has decided. */
export function decided(said: readonly Said[], policy: Policy): boolean {
  return said.some((reply) => !reply.fromAmy && readAs(reply, policy) === "decision");
}

/** What was discussed in the wait that began at `since`; another wait's is not this one's. */
function discussedSince(record: TicketRecord, since: string): Discussion | undefined {
  return record.discussion?.since === since ? record.discussion : undefined;
}

/**
 * The discussion turns of this wait nobody has answered yet, as one action —
 * or null when there are none.
 */
export function discussing(
  record: TicketRecord,
  said: readonly Said[],
  policy: Policy,
  since: string,
  about: string,
): Extract<Effect, { type: "discuss" }> | null {
  const discussed = discussedSince(record, since);
  const turns = turnsOf(said).filter((reply) => readAs(reply, policy) === "discussion" && reply.at > (discussed?.upTo ?? ""));
  if (turns.length === 0) return null;
  return { type: "discuss", since, about, thread: discussed?.lines ?? [], turns: turns.map(turnOf) };
}

/** The whole discussion of a wait, attributed, with the decision last and marked as the one that settled it. */
export function decisionLines(record: TicketRecord, said: readonly Said[], policy: Policy, since: string): string[] {
  const decisions = turnsOf(said).filter((reply) => readAs(reply, policy) === "decision");
  const last = decisions.at(-1);
  return [
    ...discussionBefore(record, { conversation: said }, policy, since),
    ...decisions.slice(0, -1).map((reply) => `${reply.author} said: ${reply.body}`),
    ...(last ? [`${last.author} decided, and this settles it: ${last.body}`] : []),
  ];
}

/**
 * Everything discussed in this wait: what was answered, then the turns not
 * answered yet, attributed. A turn asked in the same breath as the decision
 * is carried unanswered rather than dropped.
 */
export function discussionBefore(
  record: TicketRecord,
  obs: { conversation: readonly Said[] },
  policy: Policy,
  since: string,
): string[] {
  const discussed = discussedSince(record, since);
  const open = turnsOf(obs.conversation)
    .filter((reply) => readAs(reply, policy) === "discussion" && reply.at > (discussed?.upTo ?? ""))
    .map((reply) => `${reply.author} asked: ${reply.body}`);
  return [...(discussed?.lines ?? []), ...open];
}

/** What a person said, oldest first; a reply nobody can attribute is not a turn. */
function turnsOf(said: readonly Said[]): Said[] {
  return said.filter((reply) => !reply.fromAmy && reply.author).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * What a resolved escalation concluded, for the steps after it — or nothing
 * while one is open, or when none was ever discussed.
 */
export function settledDiscussion(record: TicketRecord): { discussion?: string[] } {
  const decision = record.escalation?.resolvedAt ? record.escalation.decision : undefined;
  return decision?.length ? { discussion: decision } : {};
}

function turnOf(reply: Said): DiscussionTurn {
  return { at: reply.at, author: reply.author, text: reply.body };
}
