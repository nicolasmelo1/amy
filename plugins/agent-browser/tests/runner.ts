import type { CommandResult, CommandRunner } from "@amykit/core";

/** A command runner that answers by the first rule whose words the arguments include, recording every line. */
export class FakeRunner implements CommandRunner {
  readonly lines: string[][] = [];
  constructor(private readonly rules: readonly { readonly when: readonly string[]; readonly answer: Partial<CommandResult> }[]) {}

  async run(command: string, args: readonly string[]): Promise<CommandResult> {
    this.lines.push([command, ...args]);
    const rule = this.rules.find((one) => one.when.every((word) => args.includes(word)));
    return { ok: true, exitCode: 0, stdout: "", stderr: "", ...rule?.answer };
  }
}

export const scope = (settings: Record<string, unknown>) => ({ state: "/state", home: "/home", settings });
