import { CommandResult, CommandRunner, GraphQLClient, RunOptions } from "@amykit/core";
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

    const script = this.scripts.find((candidate) => candidate.match(command, args));
    if (!script) return OK;

    const merged = { ...OK, ...script.result };
    return { ...merged, ok: script.result.ok ?? (merged.exitCode === 0) };
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

/** Answers by matching a fragment of the query text, so tests read clearly. */
export class ScriptedGraphQL implements GraphQLClient {
  public readonly calls: GraphQLCall[] = [];

  constructor(private readonly answers: { contains: string; data: unknown }[]) {}

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ query, variables });

    const answer = this.answers.find((candidate) => query.includes(candidate.contains));
    if (!answer) {
      throw new Error(`no scripted answer for a query containing any of the given fragments`);
    }

    return answer.data as T;
  }

  variablesFor(fragment: string): Record<string, unknown> {
    const call = this.calls.find((candidate) => candidate.query.includes(fragment));
    if (!call) throw new Error(`no query contained ${fragment}`);
    return call.variables;
  }
}