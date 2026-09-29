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

  it("does not require existing implementors to expose ancestry", () => {
    const host: Pick<CodeHost, "pullRequestAncestry"> = {};

    expect(host.pullRequestAncestry).toBeUndefined();
  });
});
