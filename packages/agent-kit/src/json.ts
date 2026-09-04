/**
 * Pulls the first JSON object out of a model's answer.
 *
 * An agent asked for JSON will usually oblige, and will sometimes wrap it in
 * a fenced block or a sentence. Scanning for the first balanced object is
 * more forgiving than trusting the whole reply to parse, and still fails
 * loudly when there is no object at all.
 */
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(`no JSON object in the reply: ${preview(text)}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, index + 1)) as T;
      }
    }
  }

  throw new Error(`the JSON object in the reply is not closed: ${preview(text)}`);
}

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}
