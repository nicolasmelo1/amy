// The services' tests invoke through this, never through the core directly:
// it runs the same `invoke` and, when AMY_OUTCOMES names a file, records every
// outcome it saw there. L3.EVERY_DECLARED_ERROR_IS_TESTED reads that record.
import { appendFileSync } from "node:fs";
import { invoke as run, type Contract, type Invocation, type OperationContext, type StreamItem } from "@amykit/core";

export async function invoke(contract: Contract, id: string, input: unknown, context: OperationContext): Promise<Invocation> {
  const outcome = await run(contract, id, input, context);
  if (outcome.kind === "stream") return { kind: "stream", events: recorded(id, outcome.events) };
  record(id, outcome.kind, outcome.kind === "output" ? undefined : outcome.error.code);
  return outcome;
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
