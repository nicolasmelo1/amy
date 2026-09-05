import { GraphQLClient } from "@amykit/core";
import { FollowUpRequest, Tracker } from "@amykit/workflow-ticket-to-qa";
import { Ticket } from "@amykit/workflow-ticket-to-qa";

export const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

export interface LinearConfig {
  /** Matched against the status *name*, never its category. */
  workingStatusName: string;
  /** Which repository a team's work lands in, by team key, e.g. `PROJ`. */
  repoByTeam: Readonly<Record<string, string>>;
  /** Used for a team that is not in the map. */
  defaultRepo: string;
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  branchName
  state { name }
  team { id key name }
`;

interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  branchName: string;
  state: { name: string };
  team: { id: string; key: string; name: string };
}

export class LinearTracker implements Tracker {
  private viewerId: string | null = null;

  constructor(
    private readonly client: GraphQLClient,
    private readonly config: LinearConfig,
  ) {}

  async inProgress(): Promise<Ticket[]> {
    // Filtered on the status name. The category would also match In Review,
    // In QA and Ready To Release, which are all past implementation.
    const data = await this.client.request<{ issues: { nodes: IssueNode[] } }>(
      `query Working($status: String!) {
        issues(
          filter: { assignee: { isMe: { eq: true } }, state: { name: { eq: $status } } }
          first: 50
        ) {
          nodes { ${ISSUE_FIELDS} }
        }
      }`,
      { status: this.config.workingStatusName },
    );

    return data.issues.nodes.map((node) => this.toTicket(node));
  }

  async get(ticketId: string): Promise<Ticket | null> {
    const data = await this.client.request<{ issue: IssueNode | null }>(
      `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id: ticketId },
    );

    return data.issue ? this.toTicket(data.issue) : null;
  }

  async comment(ticketId: string, body: string): Promise<void> {
    // commentCreate wants the issue's uuid, not its human identifier.
    const issue = await this.requireIssue(ticketId);

    const data = await this.client.request<{ commentCreate: { success: boolean } }>(
      `mutation Comment($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }`,
      { input: { issueId: issue.id, body } },
    );

    if (!data.commentCreate.success) {
      throw new Error(`Linear refused a comment on ${ticketId}`);
    }
  }

  async hasReplyAfter(ticketId: string, since: string): Promise<boolean> {
    const [viewer, data] = await Promise.all([
      this.viewer(),
      this.client.request<{
        issue: { comments: { nodes: { createdAt: string; user: { id: string } | null }[] } } | null;
      }>(
        `query Replies($id: String!) {
          issue(id: $id) {
            comments(first: 100) { nodes { createdAt user { id } } }
          }
        }`,
        { id: ticketId },
      ),
    ]);

    const cutoff = new Date(since).getTime();

    // A comment from the operator themselves does not count as an answer to
    // the machine's own question, otherwise asking would resolve itself.
    return (data.issue?.comments.nodes ?? []).some(
      (comment) =>
        new Date(comment.createdAt).getTime() > cutoff && comment.user?.id !== viewer,
    );
  }

  async setStatus(ticketId: string, statusName: string): Promise<void> {
    const issue = await this.requireIssue(ticketId);

    const states = await this.client.request<{
      team: { states: { nodes: { id: string; name: string }[] } } | null;
    }>(
      `query States($teamId: String!) {
        team(id: $teamId) { states(first: 50) { nodes { id name } } }
      }`,
      { teamId: issue.team.id },
    );

    const target = states.team?.states.nodes.find((state) => state.name === statusName);
    if (!target) {
      throw new Error(`${issue.team.key} has no status called "${statusName}"`);
    }

    await this.update(ticketId, { stateId: target.id });
  }

  async assign(ticketId: string, trackerIdentity: string): Promise<void> {
    const data = await this.client.request<{ users: { nodes: { id: string }[] } }>(
      `query Assignee($email: String!) {
        users(filter: { email: { eq: $email } }, first: 1) { nodes { id } }
      }`,
      { email: trackerIdentity },
    );

    const user = data.users.nodes[0];
    if (!user) {
      throw new Error(`no Linear user with the email ${trackerIdentity}`);
    }

    await this.update(ticketId, { assigneeId: user.id });
  }

  async createFollowUp(request: FollowUpRequest): Promise<string> {
    const parent = await this.requireIssue(request.parentTicketId);

    const data = await this.client.request<{
      issueCreate: { success: boolean; issue: { identifier: string } | null };
    }>(
      `mutation FollowUp($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { identifier } }
      }`,
      {
        input: {
          teamId: parent.team.id,
          parentId: parent.id,
          title: request.title,
          description: request.body,
        },
      },
    );

    if (!data.issueCreate.success || !data.issueCreate.issue) {
      throw new Error(`Linear refused a follow-up for ${request.parentTicketId}`);
    }

    return data.issueCreate.issue.identifier;
  }

  private async update(ticketId: string, input: Record<string, unknown>): Promise<void> {
    const data = await this.client.request<{ issueUpdate: { success: boolean } }>(
      `mutation Update($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }`,
      { id: ticketId, input },
    );

    if (!data.issueUpdate.success) {
      throw new Error(`Linear refused an update to ${ticketId}`);
    }
  }

  private async requireIssue(ticketId: string): Promise<IssueNode> {
    const data = await this.client.request<{ issue: IssueNode | null }>(
      `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id: ticketId },
    );

    if (!data.issue) {
      throw new Error(`${ticketId} is not in Linear`);
    }

    return data.issue;
  }

  private async viewer(): Promise<string> {
    if (this.viewerId) return this.viewerId;

    const data = await this.client.request<{ viewer: { id: string } }>(
      `query Viewer { viewer { id } }`,
    );

    this.viewerId = data.viewer.id;
    return this.viewerId;
  }

  private toTicket(node: IssueNode): Ticket {
    return {
      id: node.identifier,
      title: node.title,
      team: node.team.name,
      url: node.url,
      branchName: node.branchName,
      status: node.state.name,
      repo: this.config.repoByTeam[node.team.key] ?? this.config.defaultRepo,
    };
  }
}
