import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HIDDEN_CHARS_NOTE, outsideText } from "../src/outside-text.js";

const DISGUISED = "a_disguised_marker_survives";
const CLEAN = "clean_text_is_rewritten";
const planted = process.env.SF_FALSIFIER ?? "";

/** The marker, folded the way a reader would fold a disguise: NFKC, no invisibles, look-alikes mapped. */
const LOOK_ALIKE: Record<string, string> = {
  "\u0430": "a", "\u03B1": "a", "\u0435": "e", "\u03B5": "e", "\u212E": "e",
  "\u0456": "i", "\u04CF": "l", "\u043E": "o", "\u03BF": "o", "\u0442": "t",
  "\u03C4": "t", "\u0445": "x", "\u00D7": "x", "\u0455": "s", "\u0501": "d",
  "\u0578": "n", "\u0433": "r", "\u2039": "<", "\u27E8": "<", "\u203A": ">",
  "\u27E9": ">", "\u2215": "/", "\u2044": "/",
};

const fold = (text: string): string =>
  [...text.normalize("NFKC")]
    .filter((char) => !/[\u180E\u200B-\u200D\u2060\uFEFF]/u.test(char))
    .map((char) => LOOK_ALIKE[char] ?? char)
    .join("")
    .toLowerCase();

const markerIn = (text: string): boolean => /<\s{0,8}\/{0,1}\s{0,8}external_data\b/.test(fold(text));

const isHidden = (character: string): boolean => {
  const point = character.codePointAt(0)!;
  return (
    point === 0x061c ||
    point === 0x200e ||
    point === 0x200f ||
    (point >= 0x202a && point <= 0x202e) ||
    (point >= 0x2066 && point <= 0x2069) ||
    (point >= 0xe0000 && point <= 0xe007f)
  );
};

const hasHidden = (text: string): boolean => [...text].some(isHidden);

const bodyOf = (fenced: string) => fenced.slice(fenced.indexOf(">\n") + 2, fenced.lastIndexOf("\n</external_data>"));

const fullWidth = (text: string): string =>
  [...text].map((char) => (char === " " ? "\u3000" : String.fromCharCode(char.charCodeAt(0) + 0xFEE0))).join("");

const zeroWidth = (text: string): string => [...text].join("\u200B");

const lookAlike = (text: string): string =>
  text.replace(/a/g, "\u0430").replace(/e/g, "\u0435").replace(/x/g, "\u0445").replace(/\//g, "\u2215");

const MARKERS = [
  "<external_data>",
  "</external_data>",
  '<external_data source="ticket body">',
  "< / external_data >",
  "</ external_data >",
  "<outside_text>",
];

const DISGUISES = [fullWidth, zeroWidth, lookAlike, (text: string) => zeroWidth(fullWidth(text))];

/** Text with a marker in it, disguised one way or another, among arbitrary other text. */
const hostile = fc
  .tuple(fc.string(), fc.constantFrom(...MARKERS), fc.constantFrom(...DISGUISES), fc.string())
  .map(([before, marker, disguise, after]) => `${before}${disguise(marker)}${after}`);

/** Text with nothing hidden, no marker, and within the limit the property speaks about. */
const clean = fc
  .string({ maxLength: 200 })
  .filter((text) => !hasHidden(text) && !markerIn(text));

const hidden = fc.constantFrom("\u202E", "\u2066", "\u2069", "\u200E", "\u200F", "\u{E0041}", "\u{E007F}");

describe("outside text, for any text", () => {
  it(DISGUISED, () => {
    fc.assert(
      fc.property(hostile, (text) => {
        const fenced =
          planted === DISGUISED
            ? // The mutation: the envelope is built without neutralising the body.
              `<external_data source="ticket body">\n${text}\n</external_data>`
            : outsideText(text, { source: "ticket body" });

        expect(fenced.match(/<external_data\b/gi) ?? []).toHaveLength(1);
        expect(fenced.match(/<\/external_data\b/gi) ?? []).toHaveLength(1);
        expect(markerIn(bodyOf(fenced))).toBe(false);
      }),
    );
  });

  it(CLEAN, () => {
    fc.assert(
      fc.property(fc.tuple(clean, fc.array(hidden, { maxLength: 4 })), ([text, hiddenCharacters]) => {
        const withHidden = `${text}${hiddenCharacters.join("")}`;
        const fenced = outsideText(withHidden, { source: "ticket body" });
        // The mutation: a body that was already clean is rewritten anyway.
        const out = planted === CLEAN ? fenced.replace(`>\n${bodyOf(fenced)}\n`, `>\n${bodyOf(fenced)} \n`) : fenced;
        const body = bodyOf(out);

        expect(hasHidden(body)).toBe(false);
        expect(body.split(HIDDEN_CHARS_NOTE)).toHaveLength(hiddenCharacters.length === 0 ? 1 : 2);
        if (hiddenCharacters.length === 0) expect(body).toBe(text);
      }),
      { numRuns: 300 },
    );
  });
});
