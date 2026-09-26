import { describe, it, expect } from "vitest";
import {
  assertValidGhAnswer,
  assertValidGhInvocation,
  ContractViolation,
  ScriptedGraphQL,
  ScriptedRunner,
  whenArgsInclude,
} from "../src/index.js";

// Every check the doubles make, shown firing. A contract check nothing
// proves goes quiet the day it breaks, and the doubles go back to answering
// whatever they are asked.

const SEARCH = `query ReviewRequests($search: String!) {
  search(query: $search, type: ISSUE, first: 50) {
    nodes { ... on PullRequest { number title } }
  }
}`;

const gh = (...args: string[]) => () => assertValidGhInvocation(args);

describe("the gh contract: what the pinned release would refuse", () => {
  it("refuses a command gh does not have", () => {
    expect(gh("pull", "list")).toThrow(/gh has no command "pull list"/);
  });

  it("refuses a flag the command does not take", () => {
    expect(gh("pr", "list", "--repo", "o/r", "--sort", "created")).toThrow(/gh pr list takes no flag --sort/);
  });

  it("takes a flag the parent command lends its children", () => {
    expect(gh("pr", "list", "--repo", "o/r", "--state", "open")).not.toThrow();
  });

  // The defect this contract exists for: the document travels as the field
  // `query`, so a variable of that name is the field claimed twice.
  it("refuses a GraphQL variable that claims the document's own field, in gh's words", () => {
    expect(gh("api", "graphql", "-f", `query=${SEARCH}`, "-F", "query=is:pr")).toThrow(
      'unexpected override existing field under "query"',
    );
  });

  it("appends a key[] field rather than calling it claimed twice", () => {
    const request = assertValidGhInvocation([
      "api", "--method", "POST", "/repos/o/r/pulls/1/requested_reviewers",
      "-f", "reviewers[]=ada", "-f", "reviewers[]=edsger",
    ]);
    expect(request.api?.params).toEqual({ reviewers: ["ada", "edsger"] });
  });

  it("types a -F field the way gh does", () => {
    const request = assertValidGhInvocation([
      "api", "graphql", "-f", "query=query Q($n: Int!) { repository(owner: \"o\", name: \"r\") { pullRequest(number: $n) { id } } }",
      "-F", "n=7",
    ]);
    expect(request.api?.params).toMatchObject({ n: 7 });
  });

  it("refuses a pull request field gh --json does not know", () => {
    expect(gh("pr", "list", "--json", "number,reviewers")).toThrow(/--json has no field reviewers/);
  });
});

describe("the GitHub GraphQL contract", () => {
  it("refuses a field the schema does not have", () => {
    expect(gh("api", "graphql", "-f", "query=query { viewer { loginName } }")).toThrow(/github contract: .*loginName/);
  });

  it("refuses a declared variable that was not sent", () => {
    expect(gh("api", "graphql", "-f", `query=${SEARCH}`)).toThrow(/\$search/);
  });

  it("refuses a variable in the wrong type", () => {
    expect(
      gh("api", "graphql", "-f", "query=query Q($n: Int!) { repository(owner: \"o\", name: \"r\") { pullRequest(number: $n) { id } } }", "-f", "n=seven"),
    ).toThrow(/\$n/);
  });

  it("refuses a variable the document never declared", () => {
    expect(gh("api", "graphql", "-f", `query=${SEARCH}`, "-f", "search=x", "-f", "extra=y")).toThrow(/never declared: extra/);
  });

  const answer = (data: unknown) => () =>
    assertValidGhAnswer(assertValidGhInvocation(["api", "graphql", "-f", `query=${SEARCH}`, "-f", "search=x"]), JSON.stringify({ data }));

  it("takes an answer shaped exactly like the document, with {} for a member no fragment reaches", () => {
    expect(answer({ search: { nodes: [{ number: 1, title: "t" }, {}] } })).not.toThrow();
  });

  it("refuses an answer missing a field the document selected", () => {
    expect(answer({ search: { nodes: [{ number: 1 }] } })).toThrow(/no member of SearchResultItem/);
  });

  it("refuses an answer carrying a field nobody selected", () => {
    expect(answer({ search: { nodes: [], issueCount: 3 } })).toThrow(/never selected issueCount/);
  });

  it("refuses a value in the wrong type", () => {
    expect(answer({ search: { nodes: [{ number: "1", title: "t" }] } })).toThrow(/no member|Int/);
  });

  it("refuses null where the schema promises a value", () => {
    expect(answer({ search: null })).toThrow(/SearchResultItemConnection!/);
  });

  it("does not hold an error answer to the document", () => {
    expect(() =>
      assertValidGhAnswer(
        assertValidGhInvocation(["api", "graphql", "-f", `query=${SEARCH}`, "-f", "search=x"]),
        JSON.stringify({ errors: [{ message: "rate limited" }] }),
      ),
    ).not.toThrow();
  });
});

describe("the GitHub REST contract", () => {
  it("refuses a path the API does not have", () => {
    expect(gh("api", "/repos/o/r/pullz")).toThrow(/no path in the REST API matches/);
  });

  it("refuses a method the path does not answer", () => {
    expect(gh("api", "--method", "DELETE", "/repos/o/r/pulls/1/merge")).toThrow(/does not answer DELETE/);
  });

  it("refuses a body value outside its enum", () => {
    expect(
      gh("api", "--method", "POST", "/repos/o/r/pulls/1/reviews", "-f", "event=APPROVED", "-f", "body="),
    ).toThrow(/body.event is one of "APPROVE", "REQUEST_CHANGES", "COMMENT"/);
  });

  it("refuses a body property the operation does not take", () => {
    expect(gh("api", "--method", "PUT", "/repos/o/r/pulls/1/merge", "-f", "strategy=squash")).toThrow(
      /body.strategy is not a property/,
    );
  });

  it("refuses a body missing what the operation requires", () => {
    expect(gh("api", "--method", "POST", "/repos/o/r/issues", "-f", "body=b")).toThrow(/missing title/);
  });

  it("refuses an answer carrying a property the description does not declare", () => {
    const request = assertValidGhInvocation(["api", "/repos/o/r/commits/abc/status"]);
    expect(() => assertValidGhAnswer(request, JSON.stringify({ state: "success", verdict: "green" }))).toThrow(
      /answer.verdict is not a property/,
    );
  });

  it("does not hold a --jq answer to the resource, which the filter already reshaped", () => {
    const request = assertValidGhInvocation(["api", "/repos/o/r", "--jq", ".default_branch"]);
    expect(() => assertValidGhAnswer(request, "main")).not.toThrow();
  });
});

describe("the doubles hold themselves to the contracts", () => {
  it("a scripted runner refuses the gh call gh would refuse", async () => {
    const runner = new ScriptedRunner();
    await expect(runner.run("gh", ["api", "graphql", "-f", `query=${SEARCH}`, "-F", "query=x"])).rejects.toBeInstanceOf(
      ContractViolation,
    );
  });

  it("a scripted runner refuses an answer gh could never print", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("--json"), result: { stdout: JSON.stringify([{ number: 1, title: "t" }]) } },
    ]);
    await expect(runner.run("gh", ["pr", "list", "--json", "number"])).rejects.toThrow(/prints exactly those fields/);
  });

  it("a scripted runner leaves every other command alone", async () => {
    await expect(new ScriptedRunner().run("git", ["frobnicate", "--wat"])).resolves.toMatchObject({ ok: true });
  });

  it("a scripted Linear client refuses a document Linear would refuse", async () => {
    const client = new ScriptedGraphQL([{ contains: "query", data: {} }]);
    await expect(client.request("query { issue(id: \"x\") { identifier nickname } }")).rejects.toThrow(/linear contract: .*nickname/);
  });

  it("a scripted Linear client refuses an answer Linear could never send", async () => {
    const client = new ScriptedGraphQL([{ contains: "viewer", data: { viewer: { id: 7 } } }]);
    await expect(client.request("query Viewer { viewer { id } }")).rejects.toThrow(/is ID|is String/);
  });

  it("a scripted Linear client answers an error the way the HTTP client fails on one", async () => {
    const client = new ScriptedGraphQL([{ contains: "issue", errors: [{ message: "Entity not found: Issue" }] }]);
    await expect(client.request("query I($id: String!) { issue(id: $id) { id } }", { id: "x" })).rejects.toThrow(
      "Entity not found: Issue",
    );
  });
});
