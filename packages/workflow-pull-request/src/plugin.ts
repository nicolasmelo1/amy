import { CodeHost, ConfigSchema, defineWorkflow, isCodeHostRefusal, port, withDiagramBeside } from "@amykit/core";
import { DEFAULT_POLICY, Observation, PullRequestRecord, decide } from "./decide.js";

/** The settings one call site gives it, and the only ones it has. */
export const configSchema = {
  draft: {
    type: "boolean",
    default: false,
    description: "open the pull request as a draft, for work nobody is waiting on at the moment it lands",
  },
  policy: {
    type: "record",
    description: "settleMs: how long to wait for a pull request the host opened to show. Left out, the default",
    default: {},
  },
} satisfies ConfigSchema;

const input = {
  repo: { type: "string", required: true, description: "the repository, as owner/name" },
  branch: { type: "string", required: true, description: "the branch the pull request is opened from, already on the remote" },
  title: { type: "string", required: true, description: "what the pull request is called" },
  body: { type: "string", default: "", description: "what the pull request says for itself" },
  base: { type: "string", description: "what it is opened against; left out, the host's default branch" },
  mentions: {
    type: "string",
    description: "an id the title names, so a pull request whose branch was renamed is still found rather than opened twice",
  },
} satisfies ConfigSchema;

const declared = defineWorkflow({
  name: "pull-request",
  pluginName: "@amykit/workflow-pull-request",
  configSchema,
  policy: DEFAULT_POLICY,
  // Through the port and nothing else, so the same workflow opens a merge
  // request wherever a plugin implements it. Finding by title is a method a
  // host only offers optionally, so it is asked for here and refused at boot.
  needs: { "code-host": port<CodeHost>({ requires: ["findPullRequestMentioning"] }) },
  codeHostWrites: ["open-pull-request"],
  input,
  output: {
    OPENED: (record: PullRequestRecord) => ({ number: record.pullRequest!.number, url: record.pullRequest!.url }),
    REFUSED: (record: PullRequestRecord) => ({ reason: record.refusal ?? "the host gave no reason" }),
  },
  decide,
  record: () => ({}),
  observe: async (scope, record: PullRequestRecord): Promise<Observation> => {
    // The host already answered no: that answer is final, and asking the host
    // anything more could only turn it into an outage.
    if (record.refusal !== undefined) return { pullRequest: null };
    const host = scope.ports["code-host"];
    const { repo, branch, mentions } = record.input;
    const byBranch = await host.findPullRequest(repo, branch);
    if (byBranch) return { pullRequest: byBranch };
    // One the host opened is read by its number: the branch search finds only
    // open ones, and a merged, closed or renamed one would be waited on forever.
    if (record.requested !== undefined) return { pullRequest: await host.pullRequest(repo, record.requested) };
    if (mentions === undefined) return { pullRequest: null };
    return { pullRequest: (await host.findPullRequestMentioning?.(repo, mentions)) ?? null };
  },
  actions: {
    "open-pull-request": async (scope, work) => {
      const { repo, branch, title, body, base } = (work.record as PullRequestRecord).input;
      try {
        work.outcomes.requested = await scope.ports["code-host"].openPullRequest({
          repo,
          branch,
          title,
          body,
          ...(base === undefined ? {} : { base }),
          ...(scope.config.draft ? { draft: true } : {}),
        });
      } catch (error) {
        // The host's own words are the reason the caller is handed. Anything
        // that is not its answer is the engine's to retry.
        if (!isCodeHostRefusal(error)) throw error;
        work.outcomes.refusal = error.message;
      }
    },
  },
  remember: (_scope, record: PullRequestRecord, outcomes, observation: Observation) => {
    const next: PullRequestRecord = { ...record };
    if (typeof outcomes.requested === "number") next.requested = outcomes.requested;
    if (typeof outcomes.refusal === "string") next.refusal = outcomes.refusal;
    if (observation.pullRequest) next.pullRequest = { number: observation.pullRequest.number, url: observation.pullRequest.url };
    return next;
  },
});

/**
 * Drawn by its own diagram, because a caller imports it as a value: no host
 * reads the directory a callee was installed into.
 */
export const plugin = withDiagramBeside(declared, import.meta.url);
