import { Badge, Button, Section, Stack, StateMachine, Table, Text, type Node } from "../../src/index.js";

/** What the view is a function of. */
export interface WorkSnapshot {
  readonly id: string;
  readonly state: string;
  readonly states: readonly string[];
  readonly waiting: boolean;
  readonly attempts: readonly (readonly [string, number])[];
}

/** A smaller view, used as a tag by the one below. */
function Heading(props: { readonly id: string; readonly waiting: boolean }): Node {
  return (
    <Text tone={props.waiting ? "warning" : undefined}>
      {props.id}
      {props.waiting && " (waiting)"}
    </Text>
  );
}

/** A view written the way a plugin author would write one. */
export function workView(work: WorkSnapshot): Node {
  return (
    <Stack gap={1}>
      <Heading id={work.id} waiting={work.waiting} />
      <Section title="lifecycle">
        <StateMachine states={work.states} current={work.state} />
        <Badge>{work.attempts.length}</Badge>
      </Section>
      {work.attempts.length > 0 ? (
        <Table columns={[{ width: 12 }, {}]} rows={work.attempts.map(([state, count]) => [state, String(count)])} />
      ) : null}
      <Button intent={{ action: "poke", args: { workId: work.id } }}>poke</Button>
    </Stack>
  );
}
