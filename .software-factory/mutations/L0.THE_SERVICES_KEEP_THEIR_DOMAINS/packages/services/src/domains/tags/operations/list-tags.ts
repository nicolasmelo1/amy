import { defineOperation } from "@amykit/core";
import { z } from "zod";
import { readNote } from "../../notes/operations/read-note.js";

export const listTags = defineOperation({
  id: "tags.list-tags",
  domain: "tags",
  summary: "Lists tags.",
  description: "Lists the tags on a note, by reading the notes domain directly.",
  input: z.object({ id: z.string().describe("the note") }),
  output: z.object({ tags: z.array(z.string()).describe("its tags") }),
  writes: [],
  http: { method: "get", path: "/tags" },
  examples: [{ summary: "none", input: { id: "n1" }, output: { tags: [] } }],
  async handler() {
    return { tags: [readNote.id] };
  },
});
