// The stand-in tracker: Linear's GraphQL API, as much of it as amy asks for.
//
// Usage: node tracker.mjs <state-file> <port-file>
//
// State lives in the file rather than in this process, so the run can be
// looked at, and pushed on, from outside: a colleague answering a question is
// an edit to that file, not a method call on a fake object. Every request is
// appended to a log beside it, which is what lets the scenario assert on the
// query amy actually sent rather than on the answer it got back.
//
// It dispatches on a substring of the query for the same reason the unit
// tests do: the operation name is amy's, and matching it keeps this file from
// having to parse GraphQL.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const [stateFile, portFile] = process.argv.slice(2);
const logFile = path.join(path.dirname(stateFile), "tracker.log");

const read = () => JSON.parse(fs.readFileSync(stateFile, "utf-8"));
const write = (state) => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");

const issueOf = (state, id) =>
  state.issues.find((issue) => issue.identifier === id || issue.id === id);

const teamOf = (state, issue) => state.teams.find((team) => team.id === issue.teamId);

const stateName = (state, issue) =>
  teamOf(state, issue).states.find((s) => s.id === issue.stateId).name;

/** An issue as the fields amy asks for, which is what `ISSUE_FIELDS` names. */
function issueNode(state, issue) {
  const team = teamOf(state, issue);
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    branchName: issue.branchName,
    state: { name: stateName(state, issue) },
    team: { id: team.id, key: team.key, name: team.name },
  };
}

const OPERATIONS = [
  // Filtered on the status name and on the ticket being the operator's own.
  // Both halves are honoured here, so a query that dropped either would come
  // back with work that is not amy's to pick up.
  {
    match: "query Working",
    run: (state, variables) => ({
      issues: {
        nodes: state.issues
          .filter((issue) => stateName(state, issue) === variables.status)
          .filter((issue) => issue.assigneeId === state.viewer.id)
          .map((issue) => issueNode(state, issue)),
      },
    }),
  },
  {
    match: "query Issue",
    run: (state, variables) => {
      const issue = issueOf(state, variables.id);
      return { issue: issue ? issueNode(state, issue) : null };
    },
  },
  {
    match: "query Viewer",
    run: (state) => ({ viewer: { id: state.viewer.id } }),
  },
  {
    match: "query Replies",
    run: (state, variables) => {
      const issue = issueOf(state, variables.id);
      if (!issue) return { issue: null };
      return {
        issue: {
          comments: {
            nodes: issue.comments.map((comment) => ({
              createdAt: comment.createdAt,
              user: comment.userId ? { id: comment.userId } : null,
            })),
          },
        },
      };
    },
  },
  {
    match: "query States",
    run: (state, variables) => {
      const team = state.teams.find((candidate) => candidate.id === variables.teamId);
      return { team: team ? { states: { nodes: team.states } } : null };
    },
  },
  {
    match: "query Assignee",
    run: (state, variables) => ({
      users: {
        nodes: state.users
          .filter((user) => user.email === variables.email)
          .map((user) => ({ id: user.id })),
      },
    }),
  },
  // Takes the issue's uuid, not its identifier, which is why amy resolves the
  // issue before commenting. A comment posted under any other id is refused
  // here rather than quietly landing somewhere else.
  {
    match: "mutation Comment",
    run: (state, variables) => {
      const issue = state.issues.find((candidate) => candidate.id === variables.input.issueId);
      if (!issue) return { commentCreate: { success: false } };

      issue.comments.push({
        body: variables.input.body,
        createdAt: new Date().toISOString(),
        userId: state.viewer.id,
      });
      write(state);
      return { commentCreate: { success: true } };
    },
  },
  {
    match: "mutation Update",
    run: (state, variables) => {
      const issue = issueOf(state, variables.id);
      if (!issue) return { issueUpdate: { success: false } };

      if (variables.input.stateId) issue.stateId = variables.input.stateId;
      if (variables.input.assigneeId) issue.assigneeId = variables.input.assigneeId;
      write(state);
      return { issueUpdate: { success: true } };
    },
  },
  {
    match: "mutation FollowUp",
    run: (state, variables) => {
      const team = state.teams.find((candidate) => candidate.id === variables.input.teamId);
      if (!team) return { issueCreate: { success: false, issue: null } };

      const number = state.nextIssueNumber;
      state.nextIssueNumber += 1;

      const identifier = `${team.key}-${number}`;
      state.issues.push({
        id: `uuid-${identifier}`,
        identifier,
        title: variables.input.title,
        url: `https://tracker.test/issue/${identifier}`,
        branchName: `amy/${identifier.toLowerCase()}`,
        stateId: team.states[0].id,
        teamId: team.id,
        assigneeId: state.viewer.id,
        parentId: variables.input.parentId,
        description: variables.input.description,
        comments: [],
      });
      write(state);

      return { issueCreate: { success: true, issue: { identifier } } };
    },
  },
];

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });

  request.on("end", () => {
    const { query, variables } = JSON.parse(body || "{}");
    const operation = OPERATIONS.find((candidate) => query.includes(candidate.match));

    fs.appendFileSync(
      logFile,
      `${JSON.stringify({
        at: new Date().toISOString(),
        operation: operation?.match ?? "unknown",
        authorization: request.headers.authorization ?? "",
        query,
        variables,
      })}\n`,
    );

    response.setHeader("Content-Type", "application/json");

    if (!operation) {
      response.end(JSON.stringify({ errors: [{ message: `no stand-in for: ${query}` }] }));
      return;
    }

    try {
      response.end(JSON.stringify({ data: operation.run(read(), variables ?? {}) }));
    } catch (error) {
      response.end(JSON.stringify({ errors: [{ message: error.message }] }));
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(portFile, String(server.address().port), "utf-8");
});
