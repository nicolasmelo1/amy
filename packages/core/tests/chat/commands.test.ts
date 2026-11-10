import { describe, expect, it } from "vitest";
import { commandsIn, refusedCommands, specOf, tokenize } from "../../src/index.js";

const specs = [
  { words: ["status"], summary: "what is running" },
  { words: ["plugin", "add"], args: "<spec>", summary: "add a plugin" },
  { words: ["plugin"], summary: "never matched before plugin add" },
];

describe("the commands an answer names", () => {
  it("are read only from blocks tagged amy, a leading amy allowed", () => {
    const asked = commandsIn("Run `amy stop` maybe.\n\n```amy\namy status\n# a comment\n\nplugin add \"@amykit/plugin-x\"\n```\n");
    expect(asked.commands.map((one) => one.argv)).toEqual([["status"], ["plugin", "add", "@amykit/plugin-x"]]);
    expect(asked.unreadable).toEqual([]);
  });

  it("keeps a block tagged with a file name by that name", () => {
    const asked = commandsIn("```yaml config.yaml\nworkflows: {}\n```\n```amy\nconfig apply\n```");
    expect(asked.blocks.get("config.yaml")).toBe("workflows: {}\n");
    expect(asked.commands.map((one) => one.argv)).toEqual([["config", "apply"]]);
  });

  it("names nothing in an answer with no block", () => {
    expect(commandsIn("amy status would tell you").commands).toEqual([]);
  });
});

describe("a line is split as a person reads it, and a shell line is refused", () => {
  it("splits on spaces and keeps quoted text whole", () => {
    expect(tokenize(`brief write TBO-1 scope "it's the \\"api\\" one"`)).toEqual({ argv: ["brief", "write", "TBO-1", "scope", `it's the "api" one`] });
    expect(tokenize("a '' b")).toEqual({ argv: ["a", "", "b"] });
    expect(tokenize(String.raw`add "C:\Users\Ada Smith\workflow"`)).toEqual({ argv: ["add", String.raw`C:\Users\Ada Smith\workflow`] });
  });

  it.each(["status | sh", "status; rm -rf /", "status && x", "echo $(id)", "status > out", "echo `id`"])("refuses %s", (line) => {
    expect(tokenize(line)).toMatchObject({ why: expect.stringMatching(/shell line/) });
  });

  it("refuses a quote left open, and an empty line", () => {
    expect(tokenize(`status "open`)).toEqual({ why: "leaves a quote open" });
    expect(tokenize("   ")).toEqual({ why: "names nothing" });
  });
});

describe("only commands on the list run (A4)", () => {
  it("refuses arguments to a command that takes none", () => {
    expect(refusedCommands(commandsIn("```amy\nstatus --all\nplugin add x\n```"), specs)).toEqual([{ line: "status --all", why: "`amy status` takes no arguments from the chat" }]);
  });

  it("matches the longest run of words", () => {
    expect(specOf({ argv: ["plugin", "add", "x"], line: "" }, specs)?.words).toEqual(["plugin", "add"]);
  });

  it("refuses a command off the list and a shell line by name", () => {
    const refused = refusedCommands(commandsIn("```amy\nstatus\nrm -rf /tmp/x\nstatus | sh\n```"), specs);
    expect(refused).toEqual([
      { line: "status | sh", why: expect.stringMatching(/shell line/) },
      { line: "rm -rf /tmp/x", why: "`rm -rf` is not a command amy runs from the chat" },
    ]);
  });
});
