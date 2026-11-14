import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { HostServices, Plugin, mount } from "@amykit/core";
import { plugin as command } from "@amykit/plugin-command";
import { readResources } from "../src/resources.js";
import { ProveWorld, newRun, operationsPlugin, prove, walk } from "./world.js";

const SCENARIO = "name: on-the-app\nresources: [app]\nsteps:\n  - { id: open, operation: app.open, input: {} }\nassertions:\n  - { id: opened, step: open, path: open, equals: true }\n";

describe("a resource is the commands its config names", () => {
  it("is brought up, checked and taken down only through the commands port", async () => {
    const ok = () => ({ ok: true, output: "" });
    const world = new ProveWorld({ resources: { app: { capacity: 1, up: "app-up", check: "app-check", down: "app-down" } } }, { "app-up": ok, "app-check": ok, "app-down": ok });
    world.brief("PROJ-15", SCENARIO);
    const mounted = await world.mounted([operationsPlugin("app", { "app.open": () => ({ open: true }) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "PROJ-15/PROVE#1"), { throughWaits: true });

    expect(record.state).toBe("PROVEN");
    expect(world.ran).toEqual(["app-up", "app-check", "app-down"]);
  });

  it("fails the run naming the resource and its check's output when the check fails, and releases it", async () => {
    const world = new ProveWorld({ resources: { app: { capacity: 1, up: "app-up", check: "app-check", down: "app-down" } } }, {
      "app-up": () => ({ ok: true, output: "" }),
      "app-check": () => ({ ok: false, output: "connection refused on :4000" }),
      "app-down": () => ({ ok: true, output: "" }),
    });
    world.brief("PROJ-16", SCENARIO);
    const mounted = await world.mounted([operationsPlugin("app", { "app.open": () => ({ open: true }) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "PROJ-16/PROVE#1"), { throughWaits: true });

    expect(record.state).toBe("refused");
    expect(record.verdict?.refused).toBe("the resource `app` failed its check `app-check` (exit 1):\nconnection refused on :4000");
    expect(world.ran).toEqual(["app-up", "app-check", "app-down"]);
  });

  it("refuses at mount a resource with no check, naming it", async () => {
    const world = new ProveWorld({ resources: { app: { capacity: 1, up: "app-up" } } }, { "app-up": () => ({ ok: true, output: "" }) });

    await expect(world.mounted()).rejects.toThrow("the resource `app` names no `check` command: a resource nothing checks is assumed, not proven");
  });

  it("refuses at mount a resource whose command the commands port does not allow", async () => {
    const world = new ProveWorld({ resources: { app: { capacity: 1, check: "app-check" } } }, {});

    await expect(world.mounted()).rejects.toThrow("`app` runs `app-check`, which the commands port does not allow: it allows nothing");
  });

  it("refuses a resource of no seats, and a key a resource does not have", () => {
    expect(() => readResources({ app: { capacity: 0, check: "c" } })).toThrow("the resource `app` has a capacity of 0");
    expect(() => readResources({ app: { check: "c", port: 4000 } })).toThrow("the resource `app` names `port`");
  });
});

describe("the documented web example", () => {
  const doc = fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "..", "docs", "build", "prove-a-phase.md"), "utf-8");
  const example = parseYaml(/### Worktrees side by side, with portless[\s\S]*?```yaml\n([\s\S]*?)```/.exec(doc)![1]!) as { plugins: Record<string, Record<string, unknown>> };

  it("brings two worktrees' apps up side by side with portless, through the commands port", async () => {
    const lines: string[] = [];
    const host: HostServices = {
      runner: { run: async (_command, args) => { lines.push(String(args[1])); return { ok: true, exitCode: 0, stdout: "", stderr: "" }; } },
      now: () => new Date(),
      paths: { state: fs.mkdtempSync(path.join(os.tmpdir(), "amy-portless-")) },
    };
    const world = new ProveWorld();
    const providers: Plugin[] = world.ports().filter((one) => one.name !== "fake-commands");
    const settings = { "@amykit/plugin-command": example.plugins["@amykit/plugin-command"], [prove.name]: example.plugins["@amykit/plugin-prove"] };
    const outcome = await mount([command, prove, ...providers, operationsPlugin("shop", { "shop.open": () => ({ open: true }) })], settings, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const resources = readResources(example.plugins["@amykit/plugin-prove"]!.resources as Record<string, unknown>);
    expect(Object.keys(resources)).toEqual(["shop-main", "shop-fix-ui"]);
    const commands = outcome.mounted.ports.get("commands") as { run(name: string): Promise<{ ok: boolean }> };
    for (const one of Object.values(resources)) {
      await commands.run(one.up!);
      await commands.run(one.check);
    }
    const downs: string[] = [];
    for (const one of Object.values(resources)) {
      await commands.run(one.down!);
      downs.push(lines.at(-1)!);
    }
    // Both worktrees run one command line, so each stops the process it started, never the other's.
    expect(downs[0]).toContain("shop-main.pid");
    expect(downs[1]).toContain("shop-fix-ui.pid");
    expect(downs.join("\n")).not.toMatch(/pkill|killall/);

    expect(lines.filter((line) => line.includes("portless shop npm run dev"))).toHaveLength(2);
    expect(lines.some((line) => line.includes("https://shop.localhost/"))).toBe(true);
    expect(lines.some((line) => line.includes("https://fix-ui.shop.localhost/"))).toBe(true);
    fs.rmSync(host.paths.state, { recursive: true, force: true });
  });

  it("is the only place portless is named: no file in the proving plugin names it", () => {
    const root = path.resolve(import.meta.dirname, "..", "src");
    for (const file of fs.readdirSync(root)) expect(fs.readFileSync(path.join(root, file), "utf-8")).not.toMatch(/portless/i);
  });
});
