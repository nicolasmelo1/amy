import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkScenario } from "../src/scenario.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

/**
 * What proves work is the domain's: marketing checks something was
 * published, a call center that the call was made. No repository, no app,
 * no code digest — one operation each, offered by the domain's own plugins.
 */
const LAUNCH = [
  "name: the-launch-went-out",
  "steps:",
  "  - { id: page, operation: pages.check-published, input: { url: \"https://acme.example/launch\" } }",
  "  - { id: mail, operation: messages.check-sent, input: { to: \"customers\", subject: \"We launched\" } }",
  "assertions:",
  "  - { id: live, criterion: C1, step: page, path: live, equals: true }",
  "  - { id: sent, criterion: C2, step: mail, path: delivered, equals: 1200 }",
  "",
].join("\n");

describe("the proving plugin is the domain's, not the code's", () => {
  it("mounts on an install with no repository and proves a scenario checking a published page and a sent message", async () => {
    const world = new ProveWorld();
    world.brief("LAUNCH-1", LAUNCH);
    const mounted = await world.mounted([
      operationsPlugin("@acme/plugin-pages", { "pages.check-published": () => ({ live: true }) }),
      operationsPlugin("@acme/plugin-mail", { "messages.check-sent": () => ({ delivered: 1200 }) }),
    ], ["commands"]);
    expect(checkScenario({ sections: [{ name: "Scenario", body: LAUNCH }] }, mounted.operations)).toEqual([]);

    const { record } = await walk(world, mounted, newRun(mounted, "LAUNCH-1/PROVE#1"));

    expect(record.state).toBe("PROVEN");
    expect(record.digest).toBeNull();
    const proof = JSON.parse(fs.readFileSync(path.join(world.artifacts, "proofs", "LAUNCH-1.json"), "utf-8"));
    expect(proof).toMatchObject({ codeDigest: null, against: ["@acme/plugin-pages", "@acme/plugin-mail"] });
  });

  it("brings nothing into the core: the plugin imports the core's public entry and nothing under it", () => {
    const root = path.resolve(import.meta.dirname, "..", "src");
    for (const file of fs.readdirSync(root)) {
      const text = fs.readFileSync(path.join(root, file), "utf-8");
      expect(text).not.toMatch(/packages\/core|@amykit\/core\//);
    }
  });
});
