import { describe, it, expect } from "vitest";
import { CommandResult } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { hermesChannel, hermesTargetIsKnown } from "../src/hermesChannel.js";

const announcement = {
  text: "ACME-1 needs an answer before I can start.",
  workId: "ACME-1",
  state: "CLARIFYING",
};

describe("hermesChannel", () => {
  it("pipes the text to hermes send, using its own credentials", async () => {
    const runner = new ScriptedRunner();

    await hermesChannel(runner, "telegram").deliver(announcement);

    const call = runner.callsTo("hermes")[0]!;
    expect(call.args).toEqual([
      "send",
      "--to",
      "telegram",
      "--quiet",
      "--subject",
      "amy ACME-1",
    ]);
    expect(call.options?.stdin).toBe(announcement.text);
  });

  it("reports a failure so the fan-out can log it", async () => {
    const runner = new ScriptedRunner([
      {
        match: (command) => command === "hermes",
        result: { exitCode: 1, stderr: "no target configured" } as Partial<CommandResult>,
      },
    ]);

    await expect(hermesChannel(runner, "telegram").deliver(announcement)).rejects.toThrow(
      /no target configured/,
    );
  });
});

describe("hermesTargetIsKnown", () => {
  /** Shaped from a real `hermes send --list --json` answer. */
  const listing = {
    platforms: {
      slack: [
        { id: "C0B52GEF63Y", name: "nico-and-his-bot", type: "private" },
        {
          id: "C0B52GEF63Y:1787663158.027689",
          name: "C0B52GEF63Y / topic 1787663158.027689",
          type: "group",
        },
      ],
      telegram: [{ id: "1234", name: "Nico Melo", type: "dm" }],
    },
  };

  it("accepts a channel matched by name", () => {
    expect(hermesTargetIsKnown(listing, "slack:nico-and-his-bot")).toBe(true);
  });

  it("accepts a channel matched by id", () => {
    expect(hermesTargetIsKnown(listing, "slack:C0B52GEF63Y")).toBe(true);
  });

  it("accepts a thread target", () => {
    expect(hermesTargetIsKnown(listing, "slack:C0B52GEF63Y:1787663158.027689")).toBe(true);
  });

  it("accepts a leading hash on a channel name", () => {
    expect(hermesTargetIsKnown(listing, "slack:#nico-and-his-bot")).toBe(true);
  });

  it("accepts a bare platform, which sends to its home channel", () => {
    expect(hermesTargetIsKnown(listing, "slack")).toBe(true);
    expect(hermesTargetIsKnown(listing, "telegram")).toBe(true);
  });

  it("rejects a platform that is not configured", () => {
    expect(hermesTargetIsKnown(listing, "discord")).toBe(false);
    expect(hermesTargetIsKnown(listing, "discord:#ops")).toBe(false);
  });

  it("rejects a channel that does not exist on a configured platform", () => {
    expect(hermesTargetIsKnown(listing, "slack:#does-not-exist")).toBe(false);
  });

  it("rejects everything when hermes reported no platforms", () => {
    expect(hermesTargetIsKnown({}, "slack")).toBe(false);
  });

  it("is not fooled by a platform named only in the usage text", () => {
    // The human-readable listing ends with a line naming a platform as an
    // example, which is what made the first version of this check pass for a
    // platform that was never configured.
    const slackOnly = { platforms: { slack: [{ id: "C1", name: "ops" }] } };

    expect(hermesTargetIsKnown(slackOnly, "telegram")).toBe(false);
  });
});
