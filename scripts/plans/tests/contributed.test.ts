import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CliFacts } from "../../docs/lib/facts.js";
import { authoredProblems } from "../authored.js";
import { commandsOf, operationsOf, type ContributedOperation } from "../contributed.js";

const repo = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => fs.readFileSync(path.join(repo, file), "utf8");

/** Every TypeScript source under a `src/` of the workspace's plugins, examples and packages. */
function sources(): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) found.push(path.join(directory, entry.name));
    }
  };
  for (const top of ["plugins", "examples", "packages"]) {
    for (const entry of fs.readdirSync(path.join(repo, top), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(repo, top, entry.name, "src");
      if (fs.existsSync(src)) visit(src);
    }
  }
  return found.map((one) => path.relative(repo, one));
}

const plan = (body: string) => [
  "---",
  "touches:",
  "  - \"src/a.ts\"",
  "criteria:",
  "  - { id: A1, statement: \"it works\", proof: \"test:tests/a.test.ts\", sources: [S1] }",
  "---",
  "# A plan",
  body,
].join("\n");

/** What check:plans says about a plan naming commands the operations spell. */
const judge = (operations: readonly ContributedOperation[], body: string): string[] => {
  const cli: CliFacts = { name: "amy", description: "", options: [], commands: commandsOf(operations, body) };
  return authoredProblems({ file: "plans/x.md", text: plan(body), baseFiles: new Set(["src/a.ts", "tests/a.test.ts"]), cli });
};

describe("the operations the repository spells", () => {
  const operations = operationsOf(sources(), read);

  it("finds every operation that spells a command, eleven of them", () => {
    expect(operations.map((one) => one.words.join(" ")).sort()).toEqual([
      "btw",
      "models refresh",
      "models show",
      "note",
      "prove record",
      "prove show",
      "roster confirm",
      "roster show",
      "worktrees list",
      "worktrees prune",
      "worktrees remove",
    ]);
  });

  it("finds prove show, worktrees remove and roster confirm where they are spelled", () => {
    expect(operations.find((one) => one.words.join(" ") === "prove show")).toMatchObject({ file: "plugins/prove/src/operations.ts", positional: ["unit"] });
    expect(operations.find((one) => one.words.join(" ") === "worktrees remove")).toMatchObject({ file: "plugins/file-worktree/src/plugin.ts", positional: ["workId"] });
    expect(operations.find((one) => one.words.join(" ") === "roster confirm")).toMatchObject({ file: "examples/workflow-ticket-to-qa/src/plugin.ts", positional: [] });
  });
});

describe("the commands the operations become", () => {
  const commands = commandsOf(operationsOf(sources(), read), "");
  const flagsOf = (words: string) => commands.find((one) => one.path.join(" ") === words)?.options.map((option) => option.flags) ?? [];

  it("spell each field as the CLI spells it, a boolean with its --no- form, and every command takes --json", () => {
    expect(flagsOf("prove show")).toEqual(["--json", "--digest <value>", "--revision <number>"]);
    expect(flagsOf("worktrees remove")).toEqual(["--json", "--force", "--no-force"]);
    expect(flagsOf("models refresh")).toEqual(["--json", "--dry-run", "--no-dry-run", "--stale-after <number>"]);
    expect(flagsOf("note")).toEqual(["--json", "--repo <value>", "--source <value>"]);
  });

  it("take their positionals by position, and run their default when their group is named alone", () => {
    expect(commands.find((one) => one.path.join(" ") === "prove show")?.arguments.map((one) => one.name)).toEqual(["<unit>"]);
    expect(commands.find((one) => one.path.join(" ") === "worktrees list")?.isDefault).toBe(true);
    expect(commands.find((one) => one.path.join(" ") === "worktrees")?.isDefault).toBe(false);
  });
});

describe("the commands a groomed plan names on the operations", () => {
  const operations = operationsOf(sources(), read);

  it("pass the operation's words, its positionals and its flags", () => {
    expect(judge(operations, "Run `amy prove show PROJ-12 --revision 3`, `amy worktrees remove PROJ-12 --force` and `amy note hi --repo acme/api`.")).toEqual([]);
  });

  it("pass a group named alone when one of its operations is its default, and refuse an unknown word under it", () => {
    expect(judge(operations, "`amy models` lists them.")).toEqual([]);
    expect(judge(operations, "`amy prove nonexistent`")).toEqual([expect.stringMatching(/the CLI declares no amy prove nonexistent/)]);
    expect(judge(operations, "`amy worktrees nonexistent`")).toEqual([expect.stringMatching(/the CLI declares no amy worktrees nonexistent/)]);
  });

  it("refuse an option the operation does not declare, even when the plan spells it on another command it did not read", () => {
    expect(judge(operations, "`amy prove show PROJ-12 --revison 3` names one it does not.")).toEqual([expect.stringMatching(/amy prove show declares no --revison/)]);
  });
});

describe("an operation whose input is not an inline z.object", () => {
  const spelled = [
    'import { defineOperation } from "@amykit/core";',
    'import { z } from "zod";',
    "const shared = z.object({});",
    "const unread = defineOperation({",
    '  id: "x.unread",',
    "  input: shared,",
    `  cli: { words: ["unread"], positional: ["id"] },`,
    "});",
    "const spread = defineOperation({",
    '  id: "x.spread",',
    "  input: z.object({ named: z.string(), ...shared }),",
    '  cli: { words: ["spread"] },',
    "});",
    "const words = [\"not\", \"spelled\"];",
  ].join("\n");
  const unread = operationsOf(["synthetic.ts"], () => spelled);

  it("keeps its command and positionals, and takes any option the plan spells on it", () => {
    expect(unread).toEqual([
      expect.objectContaining({ words: ["unread"], positional: ["id"], fields: undefined }),
      expect.objectContaining({ words: ["spread"], fields: undefined }),
    ]);
    expect(judge(unread, "`amy unread T-1 --anything y` and `amy spread --whatever`")).toEqual([]);
  });

  it("counts two operations that spell the same words as one command, and leaves their refusal to the mount", () => {
    const twice = [...unread, ...unread];
    expect(commandsOf(twice, "").map((one) => one.path.join(" "))).toEqual(["spread", "unread"]);
  });
});

describe("a field that is a list", () => {
  const spelled = [
    'import { defineOperation } from "@amykit/core";',
    'import { z } from "zod";',
    "const listed = defineOperation({",
    '  id: "x.listed",',
    "  input: z.object({ enabled: z.boolean().array().optional() }),",
    '  cli: { words: ["listed"] },',
    "});",
  ].join("\n");
  const listed = operationsOf(["synthetic.ts"], () => spelled);

  it("takes a value, and has no --no- form even when its elements are booleans", () => {
    expect(listed[0]?.fields).toEqual([expect.objectContaining({ name: "enabled", kind: "array" })]);
    expect(judge(listed, "`amy listed --enabled true`")).toEqual([]);
    expect(judge(listed, "`amy listed --no-enabled`")).toEqual([expect.stringMatching(/amy listed declares no --no-enabled/)]);
  });
});

describe("two operations that spell the same words with different fields", () => {
  const spelled = [
    'import { defineOperation } from "@amykit/core";',
    'import { z } from "zod";',
    "const first = defineOperation({",
    '  id: "x.first",',
    "  input: z.object({ first: z.string() }),",
    '  cli: { words: ["shared"] },',
    "});",
    "const second = defineOperation({",
    '  id: "x.second",',
    "  input: z.object({ second: z.string() }),",
    '  cli: { words: ["shared"] },',
    "});",
  ].join("\n");
  const shared = operationsOf(["synthetic.ts"], () => spelled);

  it("pass an option either declares, and refuse one neither does", () => {
    expect(judge(shared, "`amy shared --first a` and `amy shared --second b`")).toEqual([]);
    expect(judge(shared, "`amy shared --third c`")).toEqual([expect.stringMatching(/amy shared declares no --third/)]);
  });
});
