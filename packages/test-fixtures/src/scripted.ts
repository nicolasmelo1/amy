import { CommandResult, CommandRunner, GraphQLClient, RunOptions } from "@amykit/core";
import { assertValidGhAnswer, assertValidGhInvocation } from "./contracts/gh.js";
import { assertValidRequest, assertValidResponse, type GraphQLContract } from "./contracts/graphql.js";
export interface RunCall {
  command: string;
  args: string[];
  options?: RunOptions;
}

export interface Script {
  match: (command: string, args: readonly string[]) => boolean;
  result: Partial<CommandResult>;
}

const OK: CommandResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };

export class ScriptedRunner implements CommandRunner {
  public readonly calls: RunCall[] = [];

  constructor(private readonly scripts: Script[] = []) {}

  async run(
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args: [...args], options });

    // `gh` is held to the pinned release and the APIs it reaches: an
    // invocation it would refuse, or an answer it could never print, throws
    // here instead of proving the adapter against a world that does not exist.
    const request = command === "gh" ? assertValidGhInvocation(args) : undefined;

    const script = this.scripts.find((candidate) => candidate.match(command, args));
    if (!script) return OK;

    const merged = { ...OK, ...script.result };
    const result = { ...merged, ok: script.result.ok ?? (merged.exitCode === 0) };
    if (request && result.ok) assertValidGhAnswer(request, result.stdout);
    return result;
  }

  /** Every call to one command, in order. */
  callsTo(command: string): RunCall[] {
    return this.calls.filter((call) => call.command === command);
  }

  argvFor(command: string, index = 0): string[] {
    const call = this.callsTo(command)[index];
    if (!call) throw new Error(`no call ${index} to ${command}`);
    return call.args;
  }
}

export function whenArgsInclude(...needles: string[]): Script["match"] {
  return (_command, args) => needles.every((needle) => args.some((arg) => arg.includes(needle)));
}

export interface GraphQLCall {
  query: string;
  variables: Record<string, unknown>;
}

/**
 * Answers by matching a fragment of the query text, so tests read clearly.
 *
 * Held to a published schema — Linear's unless told otherwise, because the
 * tracker is the only GraphQL client this repository has: a document the
 * service would refuse, variables it would not coerce, or an answer that is
 * not the shape of the document, throws.
 */
export class ScriptedGraphQL implements GraphQLClient {
  public readonly calls: GraphQLCall[] = [];

  constructor(
    private readonly answers: ({ contains: string; data: unknown } | { contains: string; errors: { message: string }[] })[],
    private readonly contract: GraphQLContract = "linear",
  ) {}

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ query, variables });
    const document = assertValidRequest(this.contract, query, variables);

    const answer = this.answers.find((candidate) => query.includes(candidate.contains));
    if (!answer) {
      throw new Error(`no scripted answer for a query containing any of the given fragments`);
    }

    // An error answer fails the way the HTTP client fails on one: the
    // service's messages, joined, and no data.
    if ("errors" in answer) throw new Error(answer.errors.map((error) => error.message).join("; "));

    assertValidResponse(this.contract, document, answer.data);
    return answer.data as T;
  }

  variablesFor(fragment: string): Record<string, unknown> {
    const call = this.calls.find((candidate) => candidate.query.includes(fragment));
    if (!call) throw new Error(`no query contained ${fragment}`);
    return call.variables;
  }
}