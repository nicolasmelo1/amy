import { describe, expect, it } from "vitest";
import {
  LIMITS,
  SLOP,
  countsIn,
  limitIn,
  proseProblems,
  said,
  slopIn,
  unlinkedTermsIn,
  unreachableNotes,
  type Term,
} from "../prose.js";

/** The hand-written half of the docs, held to the rules the docs check names. */
describe("the prose of a page in scope", () => {
  it("holds no count, slop, overlong page, unlinked term or unreachable note anywhere today", () => {
    expect(proseProblems().map(said)).toEqual([]);
  });
});

describe("a hand-written count", () => {
  it("fails in a heading and in a sentence, naming the line", () => {
    const page = "# Workflows\n\n## The seven things a workflow declares\n\nA workflow declares\nseven things.\n";
    const found = countsIn("docs/concepts/workflows.md", page);

    expect(found.map((one) => [one.line, one.rule])).toEqual([
      [3, "count"],
      [6, "count"],
    ]);
    expect(found[0]!.detail).toContain("seven things");
  });

  it("passes inside a marked generated table, and nowhere else is exempt", () => {
    const generated = "<!-- amy:generated workflow-index -->\n\n| seven things |\n\n<!-- amy:end workflow-index -->\n";
    expect(countsIn("docs/concepts/workflows.md", generated)).toEqual([]);

    expect(countsIn("docs/concepts/workflows.md", "<!-- seven things -->\n\nseven things\n")).toHaveLength(1);
  });

  it("passes inside a block sf docs writes", () => {
    expect(countsIn("docs/development/the-factory.md", "<!-- sf:generated rules -->\nseven things\n<!-- sf:end rules -->\n")).toEqual([]);
  });

  it("reads a digit, a number-word, and either through emphasis", () => {
    expect(countsIn("README.md", "It runs **28 gates** in CI.\n")).toHaveLength(1);
    expect(countsIn("README.md", "**Ten** gates.\n")).toHaveLength(1);
  });

  it("is not a version, a single thing, or a number before a verb", () => {
    expect(countsIn("README.md", "Version 0.6 adds it. One plugin does. Node 22 runs it.\n")).toEqual([]);
  });

  it("is read from the front matter's description too", () => {
    expect(countsIn("docs/concepts/workflows.md", "---\ntitle: Workflows\ndescription: The seven things a workflow declares\n---\n\nBody.\n")).toHaveLength(1);
  });
});

describe("slop", () => {
  const samples: Record<string, string> = {
    "em dash": "It runs — always.",
    "en dash between spaces": "It runs – always.",
  };

  for (const slop of SLOP) {
    const sentence = samples[slop.name] ?? `This line says ${slop.name} once.`;

    it(`fails on "${slop.name}" in prose, naming file, line and pattern`, () => {
      const found = slopIn("docs/guides/write-a-workflow.md", `# Title\n\n${sentence}\n`);
      expect(found.map(said)).toContain(`docs/guides/write-a-workflow.md:3 slop: "${slop.name}"`);
    });

    it(`passes on "${slop.name}" in code, inline code and a generated block`, () => {
      const page = [
        "# Title",
        "",
        "```ts",
        `// ${sentence}`,
        "```",
        "",
        `Inline: \`${sentence}\`.`,
        "",
        "<!-- amy:generated plugin-index -->",
        "",
        sentence,
        "",
        "<!-- amy:end plugin-index -->",
        "",
      ].join("\n");
      expect(slopIn("docs/guides/write-a-workflow.md", page)).toEqual([]);
    });
  }

  it("is read case-insensitively and across a line break", () => {
    expect(slopIn("README.md", "Simply put.\n")).toHaveLength(1);
    expect(slopIn("README.md", "It is not\njust a queue.\n")).toHaveLength(1);
  });
});

describe("what is allowed by decision", () => {
  it("passes an arrow, an exclamation mark, an emoji, a curly quote and deliberately", () => {
    const page = "# Title\n\n→ [Next](next.md). It works! 🎉 It is “quoted” and ‘quoted’, and deliberately so.\n";
    expect(slopIn("docs/guides/the-chat.md", page)).toEqual([]);
    expect(countsIn("docs/guides/the-chat.md", page)).toEqual([]);
  });
});

describe("a page's prose limit", () => {
  const over = (limit: number) => `# Title\n\n${"word ".repeat(Math.ceil(limit / 5) + 10)}\n`;

  for (const [file, kind] of [
    ["README.md", "readme"],
    ["docs/guides/write-a-workflow.md", "guide"],
    ["docs/concepts/workflows.md", "concept"],
    ["examples/workflow-errand/README.md", "example"],
  ] as const) {
    it(`fails a ${kind} over ${LIMITS[kind]}, naming the page, its size and the limit`, () => {
      const [finding] = limitIn(file, over(LIMITS[kind]!));
      expect(finding?.file).toBe(file);
      expect(finding?.detail).toMatch(/^\d+ prose characters, over the /);
      expect(finding?.detail.endsWith(`over the ${kind} limit of ${LIMITS[kind]}`)).toBe(true);
    });
  }

  it("does not count code or a generated block", () => {
    const code = `# Title\n\nShort.\n\n\`\`\`ts\n${"const a = 1;\n".repeat(2000)}\`\`\`\n`;
    expect(limitIn("docs/guides/write-a-workflow.md", code)).toEqual([]);
  });

  it("counts only an example's introduction, above its reference", () => {
    const page = `# errand\n\nOne sentence.\n\n<!-- amy:generated reference -->\n\n${"word ".repeat(1000)}\n\n<!-- amy:end reference -->\n`;
    expect(limitIn("examples/workflow-errand/README.md", page)).toEqual([]);
  });
});

describe("a glossary term in a guide", () => {
  const terms: Term[] = [{ term: "port", anchor: "port" }];

  it("fails when its first use does not link to its anchor, naming the page and the term", () => {
    const found = unlinkedTermsIn("docs/guides/write-a-plugin.md", "# Write a plugin\n\nA plugin mounts a port.\n", terms);
    expect(found.map(said)).toEqual([
      'docs/guides/write-a-plugin.md:3 glossary: the first use of "port" does not link to glossary.md#port',
    ]);
  });

  it("passes when the first use links, whatever follows", () => {
    const page = "# Write a plugin\n\nA plugin mounts a [port](../concepts/glossary.md#port). Every port is typed.\n";
    expect(unlinkedTermsIn("docs/guides/write-a-plugin.md", page, terms)).toEqual([]);
  });

  it("does not take the title as the first use, and finds a linked use after a code block", () => {
    const page = "---\ntitle: Write a port\n---\n\n# Ports\n\n```ts\nconst a = 1;\n```\n\nA [port](../concepts/glossary.md#port) is typed.\n";
    expect(unlinkedTermsIn("docs/guides/write-a-plugin.md", page, terms)).toEqual([]);
  });

  it("does not take a heading, or a use in code, as the first use", () => {
    const page = "# Ports\n\n`port` in code.\n\nA [port](../concepts/glossary.md#port) is typed.\n";
    expect(unlinkedTermsIn("docs/guides/write-a-plugin.md", page, terms)).toEqual([]);
  });
});

describe("a design note", () => {
  const notes = ["docs/design/a-mount-builds-once.md"];
  const exists = (file: string) => file === "docs/concepts/plugins.md";

  it("fails when no page outside docs/design and plans links it, naming the note", () => {
    const found = unreachableNotes(
      notes,
      { "docs/design/other.md": "[x](a-mount-builds-once.md)", "plans/p.md": "[x](../docs/design/a-mount-builds-once.md)" },
      {},
      exists,
    );
    expect(found.map((one) => one.file)).toEqual(["docs/design/a-mount-builds-once.md"]);
  });

  it("passes when a page a user reads links it", () => {
    expect(unreachableNotes(notes, { "docs/concepts/plugins.md": "[why](../design/a-mount-builds-once.md#why)" }, {}, exists)).toEqual([]);
  });

  it("passes when listed as superseded by something that exists, and fails when the replacement does not", () => {
    expect(unreachableNotes(notes, {}, { "a-mount-builds-once.md": "docs/concepts/plugins.md" }, exists)).toEqual([]);
    expect(unreachableNotes(notes, {}, { "a-mount-builds-once.md": "docs/gone.md" }, exists)).toHaveLength(1);
  });
});
