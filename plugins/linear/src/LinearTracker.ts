import { GraphQLClient } from "@amykit/core";
import { Comment, Feature, FeatureTracker, FollowUpRequest, GroomedWork, Ticket, Tracker } from "@amykit/core";

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
  description
  url
  branchName
  parent { id }
  labels { nodes { name } }
  state { name }
  team { id key name }
`;

interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  branchName: string;
  /** The parent is the tracker-native shared brief anchor for child work. */
  parent: { id: string } | null;
  labels: { nodes: { name: string }[] } | null;
  state: { name: string };
  team: { id: string; key: string; name: string };
}

export class LinearTracker implements Tracker, FeatureTracker {
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

  async features(): Promise<Feature[]> {
    const data = await this.client.request<{ issues: { nodes: IssueNode[] } }>(
      `query Features { issues(filter: { labels: { some: { name: { eq: "Feature" } } } }, first: 50) { nodes { ${ISSUE_FIELDS} } } }`,
    );
    return data.issues.nodes.map((node) => this.toFeature(node));
  }

  async getFeature(id: string): Promise<Feature | null> {
    const data = await this.client.request<{ issue: IssueNode | null }>(
      `query Feature($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id },
    );
    return data.issue?.labels?.nodes.some((label) => label.name === "Feature") ? this.toFeature(data.issue) : null;
  }

  async groomedWork(featureId: string, groomedBy: string): Promise<GroomedWork[]> {
    const feature = await this.requireIssue(featureId);
    const data = await this.client.request<{ issue: { children: { nodes: IssueNode[] } } | null }>(
      `query GroomedWork($id: String!) { issue(id: $id) { children(first: 100) { nodes { ${ISSUE_FIELDS} } } } }`,
      { id: feature.id },
    );
    return (data.issue?.children.nodes ?? [])
      .filter((node) => node.description?.includes(`<!-- amy:groomed-by=${groomedBy} -->`))
      .map((node) => ({ id: node.identifier, featureId, groomedBy, title: node.title, body: node.description ?? "", retired: false }));
  }

  async createGroomedWork(input: Omit<GroomedWork, "id" | "retired">): Promise<GroomedWork> {
    const parent = await this.requireIssue(input.featureId);
    const data = await this.client.request<{ issueCreate: { success: boolean; issue: { identifier: string } | null } }>(
      `mutation CreateGroomedWork($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier } } }`,
      { input: { teamId: parent.team.id, parentId: parent.id, title: input.title, description: `<!-- amy:groomed-by=${input.groomedBy} -->\n${input.body}` } },
    );
    if (!data.issueCreate.success || !data.issueCreate.issue) throw new Error(`Linear refused groomed work for ${input.featureId}`);
    return { ...input, id: data.issueCreate.issue.identifier, retired: false };
  }

  async updateGroomedWork(id: string, input: Pick<GroomedWork, "title" | "body">): Promise<GroomedWork> {
    const current = await this.requireIssue(id);
    await this.update(id, { title: input.title, description: input.body });
    return { id, featureId: current.parent?.id ?? "", groomedBy: "feature-grooming", ...input, retired: false };
  }

  async retireGroomedWork(id: string): Promise<void> {
    const data = await this.client.request<{ issueArchive: { success: boolean } }>(
      `mutation RetireGroomedWork($id: String!) { issueArchive(id: $id) { success } }`, { id },
    );
    if (!data.issueArchive.success) throw new Error(`Linear refused retirement of groomed work ${id}`);
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

  /**
   * The conversation on the ticket, oldest first, in full.
   *
   * The query asks for the author, the text and the timestamp — the three
   * things a reader needs — and `fromAmy` is settled by the account the
   * tracker says wrote each comment, which is the tracker's answer and not a
   * guess by whatever reads it. `since` narrows the fetch, so a waiting state
   * asking for what arrived after its question is not paying for the thread
   * that came before it.
   */
  async comments(ticketId: string, since?: string): Promise<Comment[]> {
    const [viewer, data] = await Promise.all([
      this.viewer(),
      this.client.request<{
        issue: {
          comments: {
            nodes: { createdAt: string; body: string; user: { id: string; name: string } | null }[];
          } | null;
        };
      }>(
        `query Conversation($id: String!) {
          issue(id: $id) {
            comments(first: 100) { nodes { createdAt body user { id name } } }
          }
        }`,
        { id: ticketId },
      ),
    ]);

    const cutoff = since === undefined ? 0 : new Date(since).getTime();

    const nodes = data.issue?.comments?.nodes ?? [];

    return nodes
      .filter((comment) => new Date(comment.createdAt).getTime() > cutoff)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((comment) => ({
        author: comment.user?.name ?? "",
        body: comment.body,
        at: comment.createdAt,
        fromAmy: comment.user?.id === viewer,
      }));
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

  private toFeature(node: IssueNode): Feature {
    return {
      id: node.identifier,
      title: node.title,
      ...(node.description ? { body: node.description } : {}),
      repos: [this.config.repoByTeam[node.team.key] ?? this.config.defaultRepo].filter(Boolean),
    };
  }

  private toTicket(node: IssueNode): Ticket {
    return {
      id: node.identifier,
      title: node.title,
      team: node.team.name,
      url: node.url,
      branchName: node.branchName,
      status: node.state.name,
      // Absent stays absent. An empty description is a real state, and a
      // ticket whose body never reached the agent has to look like one
      // rather than like an empty string pretending there was nothing to say.
      ...(node.description ? { body: node.description } : {}),
      // A parent groups child tickets under one tracker-native brief. The
      // workflow owns no guessed fallback: a ticket without a parent has no brief.
      ...(node.parent ? { briefId: node.parent.id } : {}),
      // A label is what the team says the ticket *is*, so the names arrive
      // as given, in the order the tracker keeps them, empty where there are
      // none — a ticket without a label is a real ticket, not an error.
      labels: (node.labels?.nodes ?? []).map((label) => label.name),
      repo: this.config.repoByTeam[node.team.key] ?? this.config.defaultRepo,
    };
  }
}
