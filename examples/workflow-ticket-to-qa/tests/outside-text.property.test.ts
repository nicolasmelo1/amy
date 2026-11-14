import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { thread, ticket } from "@amykit/test-fixtures";
import { discussPrompt, implementPrompt, threadPrompt, triagePrompt } from "../src/agent-steps.js";

const FALSIFIER = "a_field_left_outside";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** Everything a prompt says outside the envelopes it carries. */
const outside = (prompt: string): string => prompt.replace(/<external_data\b[\s\S]*?<\/external_data>/gi, "");

const word = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 5, maxLength: 10 })
  .map((letters) => letters.join(""));
const words = fc.uniqueArray(word, { minLength: 9, maxLength: 9 });

describe("ticket-to-qa's prompts, for any ticket", () => {
  it(FALSIFIER, () => {
    fc.assert(
      fc.property(words, (given) => {
        const [title, body, label, comment, threadBody, replyBody, discussion, turn, settledComment] = given as [
          string, string, string, string, string, string, string, string, string,
        ];

        const subject = ticket({ title: `Title ${title}`, body: `Body ${body}`, labels: [`Label ${label}`] });
        const conversation = [`ada answered: ${comment}`];
        const threads = [
          thread({
            id: "T1",
            author: "edsger",
            body: `Thread ${threadBody}`,
            comments: [
              { author: "edsger", body: `Thread ${threadBody}`, createdAt: "2026-11-13T10:00:00.000Z" },
              { author: "ada", body: `Reply ${replyBody}`, createdAt: "2026-11-13T11:00:00.000Z" },
            ],
          }),
        ];
        const said = [`ada said: ${discussion}`];
        const turns = [{ author: "ada", text: `Turn ${turn}` }];

        const built = {
          triage: { prompt: triagePrompt(subject, conversation), carries: [title, body, label, comment] },
          implement: { prompt: implementPrompt(subject, undefined, undefined, conversation, said), carries: [title, body, label, comment, discussion] },
          thread: {
            prompt: threadPrompt(subject, threads, "human", {}, said),
            carries: [title, body, label, threadBody, replyBody, discussion],
          },
          discuss: {
            prompt: discussPrompt(subject, "a decision waits", said, turns, {
              clarification: [`ada answered: ${settledComment}`],
              threads,
            }),
            carries: [title, body, label, threadBody, replyBody, discussion, turn, settledComment],
          },
        };

        for (const { prompt, carries } of Object.values(built)) {
          const withMutation = planted ? `${prompt}\n${body}` : prompt;
          const bare = outside(withMutation);
          for (const token of carries) {
            expect(withMutation).toContain(token);
            expect(bare).not.toContain(token);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
