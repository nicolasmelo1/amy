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
