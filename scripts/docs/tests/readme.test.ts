import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readmeCommands, readmeFactory, readmeNodeBadge, readmeNodeVersion } from "../blocks.js";
import { cliFacts } from "../sources/cli.js";
import { factoryFacts } from "../sources/factory.js";
import { runtimeFacts } from "../sources/runtime.js";

const root = path.resolve(import.meta.dirname, "../../..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

/** The front door owns its argument, while facts inside markers come from code. */
describe("the root README", () => {
  it("contains every generated claim between markers", () => {
    for (const name of ["readme-node-badge", "readme-commands", "readme-factory"]) {
      expect(readme).toContain(`<!-- amy:generated ${name} -->`);
      expect(readme).toContain(`<!-- amy:end ${name} -->`);
    }
  });

  it("renders every top-level command from the CLI declaration", () => {
    const commands = readmeCommands(cliFacts());
    expect(readme).toContain(commands);
    expect(commands).toContain("`amy update`");
    expect(commands).not.toContain("`amy workflow new`");
  });

  it("renders a newly declared command without another handwritten row", () => {
    const cli = cliFacts();
    const commands = readmeCommands({
      ...cli,
      commands: [...cli.commands, { path: ["later"], description: "A later command", arguments: [], options: [], isDefault: false }],
    });

    expect(commands).toContain("`amy later`");
  });

  it("reads the Node requirement and factory counts from their owning files", () => {
    const runtime = runtimeFacts();
    expect(runtime.node).toBe(">=22.18.0");
    expect(readme).toContain(readmeNodeBadge(runtime));
    expect(fs.readFileSync(path.join(root, "docs/build/write-a-workflow.md"), "utf8")).toContain(readmeNodeVersion(runtime));

    const factory = readmeFactory(factoryFacts());
    expect(readme).toContain(factory);
    expect(factory).toContain("rules");
    expect(factory).toContain("gates");
  });
});
