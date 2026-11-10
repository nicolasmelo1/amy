import { describe, expect, it } from "vitest";
import type { CliFacts } from "../../docs/lib/facts.js";
import { cliFactsOf } from "../../docs/sources/cli.js";
import { authoredProblems } from "../authored.js";

const option = (flags: string) => ({ flags, description: "", default: undefined });
const command = (path: string[], options: string[] = [], args = 0) => ({
  path,
  description: "",
  arguments: Array.from({ length: args }, (_, at) => ({ name: `a${at}`, required: true, description: "" })),
  options: options.map(option),
  isDefault: false,
  hidden: false,
});

const cli: CliFacts = {
  name: "amy",
  description: "",
  options: [option("-w, --workflow <name>")],
  commands: [
    command(["doctor"]),
    command(["plugin"]),
    command(["plugin", "list"]),
    command(["workflow"]),
    command(["workflow", "add"], ["--into <name>"], 1),
    command(["config"]),
    command(["config", "explain [plugin]"]),
  ],
};

const baseFiles = new Set(["src/a.ts", "src/b.ts", "tests/a.test.ts", "package.json", "plugins/q/package.json"]);

const plan = ({ touches = ["src/a.ts"], proof = "test:tests/a.test.ts", statement = "it works", body = "" } = {}) => [
  "---",
  "touches:",
  ...touches.map((entry) => `  - "${entry}"`),
  "criteria:",
  `  - { id: A1, statement: "${statement}", proof: "${proof}", sources: [S1] }`,
  "---",
  "# A plan",
  body,
].join("\n");

const judge = (text: string) => authoredProblems({ file: "plans/x.md", text, baseFiles, cli });

describe("a groomed plan's touches", () => {
  it("passes exact paths at the base and files it creates beside them", () => {
    expect(judge(plan({ touches: ["src/a.ts", "src/new.ts", "plugins/p/package.json", "plugins/p/src/index.ts"] }))).toEqual([]);
  });

  it("refuses a tree", () => {
    expect(judge(plan({ touches: ["src/**"] }))).toEqual([expect.stringMatching(/touches src\/\*\*: name the files/)]);
  });

  it("refuses an entry listed twice", () => {
    expect(judge(plan({ touches: ["src/a.ts", "src/a.ts"] }))).toEqual(["plans/x.md touches src/a.ts twice"]);
  });

  it("refuses a path under a directory neither at the base nor holding another entry", () => {
    expect(judge(plan({ touches: ["sr/deep/a.ts"] }))).toEqual([expect.stringMatching(/touches sr\/deep\/a\.ts, and sr is neither at the base/)]);
  });

  it("refuses an absolute path, or one climbing out, rather than walking its parents forever", () => {
    expect(judge(plan({ touches: ["/README.md", "src/../x.ts"] }))).toEqual([
      expect.stringMatching(/touches \/README\.md: name a path from the repository's root/),
      expect.stringMatching(/touches src\/\.\.\/x\.ts: name a path from the repository's root/),
    ]);
  });

  it("refuses a glob that matches nothing at the base", () => {
    expect(judge(plan({ touches: ["lib/*.ts"] }))).toEqual([expect.stringMatching(/touches lib\/\*\.ts, which matches nothing/)]);
  });
});

describe("a groomed plan's proofs", () => {
  it("pass when the file is at the base or in the touches, deferred or not", () => {
    expect(judge(plan({ proof: "deferred:test:tests/a.test.ts" }))).toEqual([]);
    expect(judge(plan({ touches: ["src/a.ts", "tests/new.test.ts"], proof: "deferred:property:tests/new.test.ts#twice" }))).toEqual([]);
  });

  it("refuse a file neither at the base nor touched", () => {
    expect(judge(plan({ proof: "deferred:test:tests/missing.test.ts" }))).toEqual(["plans/x.md A1 is proven by tests/missing.test.ts, which is neither at the base nor in its touches"]);
  });

  it("refuse a proof that names no file", () => {
    expect(judge(plan({ proof: "deferred:test:mutation fixture for x" }))).toEqual([expect.stringMatching(/A1 is proven by .*which names no file/)]);
  });
});

describe("the commands a groomed plan names", () => {
  it("pass when the CLI at the base declares them and their options", () => {
    expect(judge(plan({ body: "Run `amy doctor`, `amy plugin list`, `amy workflow add ./w --into mine`, `amy config explain slack` and `amy --workflow w doctor`." }))).toEqual([]);
  });

  it("refuse a command the CLI does not declare", () => {
    expect(judge(plan({ body: "Install it with `amy plugin add slack`." }))).toEqual([expect.stringMatching(/names `amy plugin add slack`, and the CLI declares no amy plugin add/)]);
  });

  it("refuse an option the command does not declare", () => {
    expect(judge(plan({ body: "Then `amy doctor --fix`." }))).toEqual([expect.stringMatching(/amy doctor declares no --fix/)]);
  });

  it("are checked past the global options they open with", () => {
    expect(judge(plan({ body: "`amy --workflow w nonexistent`" }))).toEqual([expect.stringMatching(/the CLI declares no amy nonexistent/)]);
    expect(judge(plan({ body: "`amy -w w doctor --fix`" }))).toEqual([expect.stringMatching(/amy doctor declares no --fix/)]);
    expect(judge(plan({ body: "`amy --workflow=w doctor`" }))).toEqual([]);
    expect(judge(plan({ body: "`amy --verbose doctor`" }))).toEqual([expect.stringMatching(/amy declares no global --verbose/)]);
  });

  it("pass a required option the CLI's own source declares", () => {
    const source = [
      "const program = new Command();",
      "const workflowCommand = program.command(\"workflow\");",
      "workflowCommand.command(\"add\").argument(\"<spec>\", \"what\").requiredOption(\"--into <name>\", \"where\");",
    ].join("\n");
    const parsed = cliFactsOf(source, { required: true });
    expect(authoredProblems({ file: "plans/x.md", text: plan({ body: "`amy workflow add ./w --into mine`" }), baseFiles, cli: parsed })).toEqual([]);
    expect(authoredProblems({ file: "plans/x.md", text: plan({ body: "`amy workflow add ./w --onto mine`" }), baseFiles, cli: parsed })).toEqual([expect.stringMatching(/declares no --onto/)]);
  });

  it("pass a command one of the plan's criteria builds", () => {
    expect(judge(plan({ statement: "`amy setup` walks the machine", body: "Then `amy setup`." }))).toEqual([]);
  });
});
