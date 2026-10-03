// A step's method on the shared port, and the two shapes that would smuggle
// one in without writing it there: an alias, and an interface it extends.
export interface Agent {
  ask(prompt: string, cwd: string): Promise<string>;
  implement(ticketId: string): Promise<boolean>;
}

export interface Agent extends Reviewer {}

export type Agent = { ask(prompt: string): Promise<string>; triage: (id: string) => Promise<boolean> };
