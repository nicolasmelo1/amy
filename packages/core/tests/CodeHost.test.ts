import { describe, expect, it } from "vitest";
import { CodeHost, OpenPullRequestRequest } from "../src/index.js";

describe("CodeHost stack facts", () => {
  it("keeps a pull request request valid when an implementor uses its default base", () => {
    const request: OpenPullRequestRequest = {
      repo: "acme/widgets",
      branch: "ada/child",
      title: "child",
      body: "",
    };

    expect(request.base).toBeUndefined();
  });

  it("lets an implementor that cannot answer ancestry return null", async () => {
    const host = {
      pullRequestAncestry: async () => null,
    } as Pick<CodeHost, "pullRequestAncestry">;

    await expect(host.pullRequestAncestry("acme/widgets", 1)).resolves.toBeNull();
  });
});
