// The world the shipped ticket-to-qa walks in the project-phases scenario: a
// tracker holding one ticket that names a parent brief, an agent that records
// each triage prompt and clears it, a gate that passes, and a code host with
// no pull request. Every port the workflow needs and nothing else, so the
// brief it reads is the one the project mounted.
import fs from "node:fs";
import { definePlugin } from "@amykit/core";
import type { AskContext } from "@amykit/core";

const TICKET = {
  id: "INVOICE-2",
  title: "The total is wrong on the invoice",
  url: "https://example.test/INVOICE-2",
  branchName: "ada/invoice-2-total",
  status: "In Progress",
  body: "The total is wrong on the invoice.",
  labels: [],
  repo: "acme/invoices",
  repos: ["acme/invoices"],
  briefId: "invoice-currency",
  assignee: null,
};

const RUN = { outcome: "completed", harness: "stand-in", model: "stand-in", durationMs: 1, costSource: "unknown", output: "" } as const;

export const plugin = definePlugin({
  name: "@amykit/plugin-project-world",
  configSchema: {},
  register(registry) {
    registry.port("tracker", {
      inProgress: async () => [TICKET],
      get: async (id: string) => (id === TICKET.id ? TICKET : null),
      comment: async () => {},
      comments: async () => [],
      hasReplyAfter: async () => false,
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "INVOICE-9",
    });
    registry.port("code-host", {
      findPullRequest: async () => null,
      findPullRequestMentioning: async () => null,
      reviewLoad: async () => ({}),
    });
    registry.port("agent", {
      ask: async (prompt: string, _cwd: string, context?: AskContext) => {
        if (context?.step === "triage") {
          const file = process.env.AMY_EVIDENCE_TRIAGE_LOG;
          if (file) fs.appendFileSync(file, `${JSON.stringify({ workId: context.workId, prompt })}\n`, "utf-8");
          return { text: '{"clear": true}', run: RUN };
        }
        return { text: "done", run: RUN };
      },
    });
    registry.port("gate", { run: async () => ({ ok: true, output: "", at: new Date().toISOString() }) });
  },
});
