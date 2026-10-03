// One workflow's title convention, handed to all of them.
export function pullRequestTitle(ticket: { id: string; title: string }): string {
  return `${ticket.id}: ${ticket.title}`;
}
