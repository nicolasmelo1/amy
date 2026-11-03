// Telegram's Bot API, read off the page Telegram publishes it on.
//
// Telegram serves no schema a machine can read: the reference is one HTML
// page, https://core.telegram.org/bots/api. So the contract is what that page
// says, derived — every type with its fields, every method with its
// parameters and what it returns — the way gh's is what its binary prints.
// The derivation is what is vendored and compared, not the page: the page
// also carries prose and markup that change without the API changing.

/** A field of a type, or a parameter of a method, as the page lists it. */
interface BotApiField {
  /** As written, such as `Integer`, `Array of PhotoSize`, `Integer or String`. */
  type: string;
  required: boolean;
}

export interface BotApiContract {
  /** The newest `Bot API x.y` the page's changelog names. */
  version: string;
  types: Record<string, Record<string, BotApiField>>;
  methods: Record<string, { parameters: Record<string, BotApiField>; returns: string }>;
}

const SECTION = /<h4><a class="anchor" name="[^"]*" href="#[^"]*"><i class="anchor-icon"><\/i><\/a>([^<]+)<\/h4>/g;

export function deriveBotApi(html: string): BotApiContract {
  const version = /Bot API (\d+\.\d+)/.exec(html)?.[1];
  if (!version) throw new Error("the Bot API page names no version");

  // Everything before "Getting updates" is the changelog and the guide.
  const start = html.indexOf('name="getting-updates"');
  if (start === -1) throw new Error("the Bot API page has no Getting updates section");
  const body = html.slice(start);

  const sections: { name: string; html: string }[] = [];
  const heads = [...body.matchAll(SECTION)];
  for (const [index, head] of heads.entries()) {
    const end = heads[index + 1]?.index ?? body.length;
    sections.push({ name: decode(head[1]!).trim(), html: body.slice(head.index! + head[0].length, end) });
  }

  const types: BotApiContract["types"] = {};
  const methods: BotApiContract["methods"] = {};
  for (const section of sections) {
    if (!/^\w+$/.test(section.name)) continue;
    const table = rowsOf(section.html);
    if (/^[A-Z]/.test(section.name)) {
      if (table.header[0] !== "Field") continue;
      types[section.name] = Object.fromEntries(table.rows.map(([name, type, description]) => [
        name!,
        { type: type!, required: !/^Optional\b/.test(description ?? "") },
      ]));
    } else {
      const parameters = table.header[0] === "Parameter"
        ? Object.fromEntries(table.rows.map(([name, type, required]) => [name!, { type: type!, required: required === "Yes" }]))
        : {};
      methods[section.name] = { parameters, returns: "" };
    }
  }
  for (const section of sections) {
    const method = methods[section.name];
    if (method) method.returns = returnsOf(section.html, types);
  }
  return { version, types: sorted(types), methods: sorted(methods) };
}

/** The first table in a section, as text: its header and its rows. */
function rowsOf(html: string): { header: string[]; rows: string[][] } {
  const table = /<table class="table">([\s\S]*?)<\/table>/.exec(html.split(/<h[34]/)[0] ?? "")?.[1];
  if (!table) return { header: [], rows: [] };
  const header = [...table.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((cell) => text(cell[1]!));
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((row) => [...row[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]!)))
    .filter((cells) => cells.length > 0);
  return { header, rows };
}

/**
 * What a method returns, from the sentence of its description that says so:
 * a type the page links, `Array of` one, or a literal such as `True`.
 */
function returnsOf(html: string, types: BotApiContract["types"]): string {
  const description = (html.split("<table")[0] ?? "").replace(/<\/?p>/g, " ");
  for (const sentence of description.split(/\.\s+(?=[A-Z<])/)) {
    if (!/Returns|returned|returns/.test(sentence)) continue;
    const linked = /(Array of )?<a href="#[a-z0-9]+">([A-Z]\w*)<\/a>/.exec(sentence);
    if (linked && types[linked[2]!]) return `${linked[1] ? "Array of " : ""}${linked[2]}`;
    const literal = /<em>(True|Int|Integer|String|Boolean)<\/em>/.exec(sentence);
    if (literal) return literal[1] === "Int" ? "Integer" : literal[1]!;
  }
  return "";
}

function text(html: string): string {
  return decode(html.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Keys in order, so two derivations of the same page are the same bytes. */
function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
