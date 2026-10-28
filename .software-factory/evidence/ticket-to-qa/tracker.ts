// The stand-in tracker: Linear's GraphQL API, as much of it as amy asks for.
//
// Usage: tsx tracker.ts <state-file> <port-file>
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
import { found, type Issue, type Team, type TrackerState } from "./world.js";

/** The variables amy sends, across every operation this answers. */
interface Variables {
  status?: string;
  id?: string;
  teamId?: string;
  email?: string;
  input?: {
    issueId?: string;
    body?: string;
    stateId?: string;
    assigneeId?: string;
    teamId?: string;
    title?: string;
    parentId?: string;
    description?: string;
  };
}

interface Operation {
  match: string;
  run: (state: TrackerState, variables: Variables) => unknown;
}

function usage(): never {
  throw new Error("usage: tracker.ts <state-file> <port-file>");
}

const [stateFile = usage(), portFile = usage()] = process.argv.slice(2);
const logFile = path.join(path.dirname(stateFile), "tracker.log");

const read = (): TrackerState => JSON.parse(fs.readFileSync(stateFile, "utf-8")) as TrackerState;
const write = (state: TrackerState): void =>
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");

const issueOf = (state: TrackerState, id: string | undefined): Issue | undefined =>
  state.issues.find((issue) => issue.identifier === id || issue.id === id);

const teamOf = (state: TrackerState, issue: Issue): Team =>
  found(state.teams.find((team) => team.id === issue.teamId), `team ${issue.teamId}`);

const stateName = (state: TrackerState, issue: Issue): string =>
  found(teamOf(state, issue).states.find((s) => s.id === issue.stateId), `state ${issue.stateId}`).name;

/** An issue as the fields amy asks for, which is what `ISSUE_FIELDS` names. */
function issueNode(state: TrackerState, issue: Issue): unknown {
  const team = teamOf(state, issue);
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    url: issue.url,
    branchName: issue.branchName,
    priority: issue.priority ?? 0,
    assignee: issue.assigneeId ? { email: state.users.find((user) => user.id === issue.assigneeId)?.email ?? "" } : null,
    parent: issue.parentId ? { id: issue.parentId } : null,
    labels: { nodes: (issue.labels ?? []).map((name) => ({ name })) },
    state: { name: stateName(state, issue) },
    team: { id: team.id, key: team.key, name: team.name },
  };
}

const OPERATIONS: Operation[] = [
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
    // The conversation, with the text in it. `hasReplyAfter` answers whether
    // the ticket was answered; this answers what was said, which is what the
    // waiting state needs to put the answer in front of the agent.
    match: "query Conversation",
    run: (state, variables) => {
      const issue = issueOf(state, variables.id);
      if (!issue) return { issue: null };
      return {
        issue: {
          comments: {
            nodes: issue.comments.map((comment) => ({
              createdAt: comment.createdAt,
              body: comment.body,
              user: comment.userId
                ? state.users.find((user) => user.id === comment.userId) ?? { id: comment.userId, name: comment.userId }
                : null,
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
      const input = found(variables.input, "input");
      const issue = state.issues.find((candidate) => candidate.id === input.issueId);
      if (!issue) return { commentCreate: { success: false } };

      issue.comments.push({
        body: found(input.body, "comment body"),
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
      const input = found(variables.input, "input");

      if (input.stateId) issue.stateId = input.stateId;
      if (input.assigneeId) issue.assigneeId = input.assigneeId;
      write(state);
      return { issueUpdate: { success: true } };
    },
  },
  {
    match: "mutation FollowUp",
    run: (state, variables) => {
      const input = found(variables.input, "input");
      const team = state.teams.find((candidate) => candidate.id === input.teamId);
      if (!team) return { issueCreate: { success: false, issue: null } };

      const number = state.nextIssueNumber;
      state.nextIssueNumber += 1;

      const identifier = `${team.key}-${number}`;
      state.issues.push({
        id: `uuid-${identifier}`,
        identifier,
        title: found(input.title, "title"),
        url: `https://tracker.test/issue/${identifier}`,
        branchName: `amy/${identifier.toLowerCase()}`,
        // Parked, not working: a follow-up is somebody else's decision to
        // make, and a decision nobody has made yet is not the machine's next
        // piece of work. The working status would put it in the queue.
        stateId: found(team.states[1], "second state").id,
        teamId: team.id,
        assigneeId: state.viewer.id,
        parentId: input.parentId,
        description: input.description,
        comments: [],
      });
      write(state);

      return { issueCreate: { success: true, issue: { identifier } } };
    },
  },
];

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk: Buffer) => {
    body += chunk;
  });

  request.on("end", () => {
    const { query, variables } = JSON.parse(body || "{}") as { query: string; variables?: Variables };
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
      response.end(JSON.stringify({ errors: [{ message: error instanceof Error ? error.message : String(error) }] }));
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the stand-in tracker is not on a port");
  fs.writeFileSync(portFile, String(address.port), "utf-8");
});
