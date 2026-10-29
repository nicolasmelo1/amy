import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as core from "../src/index.js";
import { Agent, CORE_ACTIONS, Gate, Ticket, Workplace } from "../src/index.js";

/**
 * The decisions in docs/design/an-agent-only-answers.md, held by the type
 * checker and by the exports. The local rules in .software-factory hold the
 * same decisions by the shape of the source; this holds them by what the
 * compiler and the package actually say, which an alias cannot get round.
 */

/** The keys a value of `T` cannot omit. */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

describe("an agent only answers", () => {
  it("has one method on its port, and it is ask", () => {
    expectTypeOf<keyof Agent>().toEqualTypeOf<"ask">();
  });

  it("dispatches every catalogue action on the agent port to ask", () => {
    const onTheAgent = Object.entries(CORE_ACTIONS).filter(([, spec]) => spec.port === "agent");

    expect(onTheAgent.length).toBeGreaterThan(0);
    expect(onTheAgent.filter(([, spec]) => spec.method !== "ask")).toEqual([]);
  });
});

describe("only the tracker speaks of tickets", () => {
  it("runs a gate on a workplace, not on a ticket", () => {
    expectTypeOf<Parameters<Gate["run"]>[0]>().toEqualTypeOf<Workplace>();
  });

  it("requires of a ticket only what every tracker has", () => {
    expectTypeOf<RequiredKeys<Ticket>>().toEqualTypeOf<"id" | "title" | "url" | "status" | "labels" | "repo">();
  });
});

describe("the core words nothing and names nobody", () => {
  it("exports no title convention", () => {
    expect("pullRequestTitle" in core).toBe(false);
  });

  it("names no product in its code, comments aside", () => {
    const vendor = /linear|github|gitlab|jira|slack|copilot|claude|codex|hermes|openai|anthropic|figma/i;
    const source = path.resolve(import.meta.dirname, "../src");
    const files = fs.readdirSync(source, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));

    const named = files.flatMap((file) => {
      const code = fs
        .readFileSync(path.join(source, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return code.split("\n").filter((line) => vendor.test(line)).map((line) => `${file}: ${line.trim()}`);
    });

    expect(named).toEqual([]);
  });
});

describe("a view is data, and depends on no UI framework or standard yet", () => {
  const ui = path.resolve(import.meta.dirname, "../../ui");
  const outside = /copilotkit|a2ui|ag-ui|ag_ui|agui/i;

  it("declares no dependency beyond the core", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ui, "package.json"), "utf-8")) as Record<string, Record<string, string> | undefined>;
    const declared = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"].flatMap((field) =>
      Object.keys(manifest[field] ?? {}),
    );

    expect(declared.filter((name) => name !== "@amykit/core")).toEqual([]);
  });

  it("imports nothing from CopilotKit, A2UI or AG-UI", () => {
    const source = path.join(ui, "src");
    const files = fs.readdirSync(source, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
    const imports = files.flatMap((file) =>
      [...fs.readFileSync(path.join(source, file), "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? ""),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(imports.filter((name) => outside.test(name))).toEqual([]);
    expect(imports.filter((name) => !name.startsWith(".") && name !== "@amykit/core")).toEqual([]);
  });
});

describe("a config is typed by its schema", () => {
  const root = path.resolve(import.meta.dirname, "../../..");

  it("leaves scalar and string-array settings uncast in shipped plugins", () => {
    const pluginSource = fs.readdirSync(path.join(root, "plugins"), { recursive: true, encoding: "utf8" }) as string[];
    const workflowSource = fs.readdirSync(path.join(root, "packages"), { recursive: true, encoding: "utf8" }) as string[];
    const pluginFiles = [
      ...pluginSource.filter((file) => /\/src\/plugin\.ts$/.test(file)).map((file) => path.join("plugins", file)),
      ...workflowSource.filter((file) => /^workflow-[^/]+\/src\/plugin\.ts$/.test(file)).map((file) => path.join("packages", file)),
    ];
    const scalarCast = /ctx\.config\.[a-zA-Z]+\s+as\s+(?:string|number|boolean|string\[\])/;
    const offenders = pluginFiles.flatMap((file) => fs.readFileSync(path.join(root, file), "utf8").split("\n")
      .filter((line) => scalarCast.test(line)).map((line) => `${file}: ${line.trim()}`));

    expect(pluginFiles.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});

describe("a mount builds once, and only the core knows when", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const sources = [
    ...fs.readdirSync(path.join(root, "plugins")).map((name) => path.join("plugins", name, "src")),
    ...fs.readdirSync(path.join(root, "packages")).filter((name) => name.startsWith("workflow-")).map((name) => path.join("packages", name, "src")),
  ].filter((directory) => fs.existsSync(path.join(root, directory)));

  it("leaves no plugin or workflow keying anything by PluginContext", () => {
    // A map keyed by the context is a plugin building its own once-per-mount
    // cache, which is what `deferred` and the host's build pass are for.
    const keyed = /\b(?:Weak)?Map\s*<\s*PluginContext\b|\bWeak(?:Ref|Set)\s*<\s*PluginContext\b/;
    const offenders = sources.flatMap((directory) =>
      fs.readdirSync(path.join(root, directory), { recursive: true, encoding: "utf8" })
        .filter((file) => /\.tsx?$/.test(file))
        .flatMap((file) => {
          const relative = path.join(directory, file);
          return fs.readFileSync(path.join(root, relative), "utf8").split("\n")
            .filter((line) => keyed.test(line))
            .map((line) => `${relative}: ${line.trim()}`);
        }),
    );

    expect(sources.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});

describe("the host lends the checkout", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const outsideTheCore = [
    ...fs.readdirSync(path.join(root, "plugins")).map((name) => path.join("plugins", name)),
    ...fs.readdirSync(path.join(root, "packages")).filter((name) => name !== "core").map((name) => path.join("packages", name)),
  ];

  /** Every line matching `pattern` in the TypeScript under `directories`, outside build output. */
  function linesMatching(directories: readonly string[], pattern: RegExp): string[] {
    return directories.filter((directory) => fs.existsSync(path.join(root, directory))).flatMap((directory) =>
      (fs.readdirSync(path.join(root, directory), { recursive: true, encoding: "utf8" }) as string[])
        .filter((file) => /\.tsx?$/.test(file) && !/(^|\/)(dist|node_modules)\//.test(file))
        .flatMap((file) => {
          const relative = path.join(directory, file);
          return fs.readFileSync(path.join(root, relative), "utf8").split("\n")
            .filter((line) => pattern.test(line))
            .map((line) => `${relative}: ${line.trim()}`);
        }),
    );
  }

  it("leaves nothing outside the core constructing a Git, tests included", () => {
    expect(outsideTheCore.length).toBeGreaterThan(20);
    expect(linesMatching(outsideTheCore, /\bnew Git\(/)).toEqual([]);
  });

  // What ships as a plugin or a workflow. The CLI is a host, and lends.
  const shipped = outsideTheCore
    .filter((directory) => directory.startsWith("plugins") || path.basename(directory).startsWith("workflow-"))
    .map((directory) => path.join(directory, "src"));

  it("leaves no shipped plugin or workflow building its checkouts by hand", () => {
    // A test may hold a layout it was handed; a plugin asks its context.
    expect(shipped.length).toBeGreaterThan(20);
    expect(linesMatching(shipped, /\blendCheckouts\(/)).toEqual([]);
  });

  it("leaves the branch settings described once, in the core", () => {
    expect(linesMatching(shipped, /^\s*(?:defaultBranch|baseBranch):\s*\{/)).toEqual([]);
  });
});
