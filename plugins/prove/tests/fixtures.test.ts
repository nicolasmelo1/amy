import { describe, expect, it } from "vitest";
import type { Operated } from "@amykit/core";
import { ensure, readFixtures } from "../src/fixtures.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const fixture = readFixtures({
  "a-signed-in-user": {
    ensure: [
      { check: { operation: "users.get", input: { id: "ada" }, expect: { path: "exists", equals: true } }, act: { operation: "users.create", input: { id: "ada" } } },
      { check: { operation: "session.get", input: {}, expect: { path: "user", equals: "ada" } }, act: { operation: "session.sign-in", input: { id: "ada" } } },
    ],
  },
})["a-signed-in-user"]!;

function world(state: { exists: boolean; user?: string }) {
  const calls: string[] = [];
  const operate = async (id: string): Promise<Operated> => {
    calls.push(id);
    if (id === "users.get") return { ok: true, output: { exists: state.exists } };
    if (id === "users.create") { state.exists = true; return { ok: true, output: {} }; }
    if (id === "session.get") return { ok: true, output: { user: state.user } };
    if (id === "session.sign-in") { state.user = "ada"; return { ok: true, output: {} }; }
    return { ok: false, error: { code: "x.unknown", message: id } };
  };
  return { calls, operate };
}

describe("a fixture ensures a state", () => {
  it("performs nothing when the state already holds", async () => {
    const { calls, operate } = world({ exists: true, user: "ada" });

    expect(await ensure("a-signed-in-user", fixture, operate)).toEqual({ holds: true, acted: [] });
    expect(calls).toEqual(["users.get", "session.get"]);
  });

  it("acts only on what differs", async () => {
    const { calls, operate } = world({ exists: true });

    expect(await ensure("a-signed-in-user", fixture, operate)).toEqual({ holds: true, acted: ["session.sign-in"] });
    expect(calls).not.toContain("users.create");
  });

  it("asks a person when it cannot reach its state", async () => {
    const proving = new ProveWorld({
      fixtures: { "an-open-account": { ensure: [{ check: { operation: "account.get", input: {}, expect: { path: "open", equals: true } } }] } },
    });
    proving.brief("TBO-10", "name: n\nfixtures: [an-open-account]\nsteps:\n  - { id: open, operation: account.get, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    let open = false;
    const mounted = await proving.mounted([operationsPlugin("bank", { "account.get": () => ({ open }) })]);

    const asked = await walk(proving, mounted, newRun(mounted, "TBO-10/PROVE#1"), { until: (record) => record.state === "ASKING" && record.asking !== undefined });
    expect(proving.posted).toEqual([{ thread: "thread-TBO-10", text: expect.stringContaining("the fixture `an-open-account` needs `account.get` to hold") }]);

    open = true;
    proving.answer("thread-TBO-10", "opened it");
    const { record } = await walk(proving, mounted, asked.record, { throughWaits: true });
    expect(record.state).toBe("PROVEN");
  });

  it("refuses at mount a fixture that is not one, by name", () => {
    expect(() => readFixtures({ broken: { ensure: [] } })).toThrow(/^the fixture `broken` is not one/);
  });
});

describe("a person's answer about a fixture", () => {
  it("is not taken for the state: the fixture is read again, and asked again while it does not hold", async () => {
    const proving = new ProveWorld({
      fixtures: { "an-open-account": { ensure: [{ check: { operation: "account.get", input: {}, expect: { path: "open", equals: true } } }] } },
    });
    proving.brief("TBO-40", "name: n\nfixtures: [an-open-account]\nsteps:\n  - { id: open, operation: account.get, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n");
    let open = false;
    const mounted = await proving.mounted([operationsPlugin("bank", { "account.get": () => ({ open }) })]);
    const asked = await walk(proving, mounted, newRun(mounted, "TBO-40/PROVE#1"), { until: (record) => record.state === "ASKING" && record.asking !== undefined });
    const firstDeadline = asked.record.asking!.deadlineAt;

    proving.answer("thread-TBO-40", "I couldn't open it");
    const again = await walk(proving, mounted, asked.record, { until: (record) => record.state === "ASKING" && record.asking !== undefined && proving.posted.length === 2 });
    expect(again.record.state).toBe("ASKING");
    expect(again.record.asking!.deadlineAt).toBe(firstDeadline);

    open = true;
    proving.clock += 1000;
    proving.answer("thread-TBO-40", "now it is open");
    expect((await walk(proving, mounted, again.record, { throughWaits: true })).record.state).toBe("PROVEN");
  });
});
