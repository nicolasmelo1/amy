import { NodeCommandRunner } from "@amykit/core";
import { afterEach, expect, it, vi } from "vitest";
import { plugin } from "../src/plugin.js";

afterEach(() => vi.restoreAllMocks());

it("reports a missing Claude binary when the plugin is checked", async () => {
  const run = vi.spyOn(NodeCommandRunner.prototype, "run").mockResolvedValue({
    ok: false, exitCode: 1, stdout: "", stderr: "claude unavailable\nmore detail",
  });
  const [check] = plugin.checks ?? [];
  expect(check).toBeDefined();
  await expect(check!.run({
    home: "", state: "", settings: {},
    out: { line: vi.fn(), error: vi.fn() },
  })).resolves.toEqual({ label: "claude available", ok: false, detail: "claude unavailable" });
  expect(run).toHaveBeenCalledWith("claude", ["--version"], { timeoutMs: 30_000 });
});
