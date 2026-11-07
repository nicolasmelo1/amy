// The services' tests invoke through this, never through the core directly:
// it runs the same `invoke` and, when AMY_OUTCOMES names a file, records every
// outcome it saw there. L3.EVERY_DECLARED_ERROR_IS_TESTED reads that record.
//
// Only an invocation of the operation the services' own contract holds is
// recorded: an example, or any other contract that reuses an id, proves
// nothing about the operation the document declares.
import { appendFileSync } from "node:fs";
import { invoke as run, type Contract, type Invocation, type OperationContext, type StreamItem } from "@amykit/core";
import { services } from "@amykit/services";

export async function invoke(contract: Contract, id: string, input: unknown, context: OperationContext): Promise<Invocation> {
  const outcome = await run(contract, id, input, context);
  const counts = isTheServices(contract, id);
  if (outcome.kind === "stream") return { kind: "stream", events: counts ? recorded(id, outcome.events) : outcome.events };
  if (counts) record(id, outcome.kind, outcome.kind === "output" ? undefined : outcome.error.code);
  return outcome;
}

function isTheServices(contract: Contract, id: string): boolean {
  const declared = services.operations.get(id);
  return declared !== undefined && contract.operations.get(id) === declared;
}

async function* recorded(id: string, events: AsyncIterable<StreamItem>): AsyncGenerator<StreamItem> {
  for await (const item of events) {
    record(id, item.kind, item.kind === "event" ? undefined : item.error.code);
    yield item;
  }
}

function record(operation: string, kind: string, code: string | undefined): void {
  const file = process.env.AMY_OUTCOMES;
  if (file) appendFileSync(file, `${JSON.stringify({ operation, kind, ...(code === undefined ? {} : { code }) })}\n`);
}
