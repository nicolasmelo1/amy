import { describe, expect, it } from "vitest";
import { isCodeHostRefusal } from "@amykit/core";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
import { GitHubCodeHost } from "../src/GitHubCodeHost.js";

const REQUEST = { repo: "Northwind/northwind-backend", branch: "ada/proj-1239", title: "t", base: "main", body: "" };

async function thrownBy(stderr: string): Promise<unknown> {
  const runner = new ScriptedRunner([
    { match: whenArgsInclude("/pulls", "POST"), result: { ok: false, exitCode: 1, stdout: "", stderr } },
  ]);
  return new GitHubCodeHost(runner).openPullRequest(REQUEST).then(() => undefined, (error: unknown) => error);
}

describe("GitHubCodeHost.openPullRequest when GitHub will not open one", () => {
  // The words are gh's own, for a branch with nothing on it beyond its base.
  it("throws a refusal carrying GitHub's reason when it answers 422", async () => {
    const error = await thrownBy("gh: No commits between main and ada/proj-1239 (HTTP 422)\n");

    expect(isCodeHostRefusal(error)).toBe(true);
    expect((error as Error).message).toContain("No commits between main and ada/proj-1239");
  });

  it("throws an ordinary failure for anything else, which the engine may retry", async () => {
    const error = await thrownBy("gh: Bad Gateway (HTTP 502)\n");

    expect(error).toBeInstanceOf(Error);
    expect(isCodeHostRefusal(error)).toBe(false);
  });
});
