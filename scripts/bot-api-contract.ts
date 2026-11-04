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
  /** The one value the page says the field always holds, such as a union member's `type`. */
  value?: string;
}

export interface BotApiContract {
  /** The newest `Bot API x.y` the page's changelog names. */
  version: string;
  types: Record<string, Record<string, BotApiField>>;
  /** A type the page defines only as one of others, such as MessageOrigin. */
  unions: Record<string, string[]>;
  methods: Record<string, { parameters: Record<string, BotApiField>; returns: string }>;
}

const SECTION = /<h4><a class="anchor" name="[^"]*" href="#[^"]*"><i class="anchor-icon"><\/i><\/a>([^<]+)<\/h4>/g;

export function deriveBotApi(html: string): BotApiContract {
  const version = /Bot API (\d+\.\d+)/.exec(html)?.[1];
  if (!version) throw new Error("the Bot API page names no version");
  const sections = sectionsOf(html).filter((section) => /^\w+$/.test(section.name));

  const types: BotApiContract["types"] = {};
  const unions: BotApiContract["unions"] = {};
  const methods: BotApiContract["methods"] = {};
  for (const section of sections) {
    const table = rowsOf(section.html);
    if (!/^[A-Z]/.test(section.name)) methods[section.name] = { parameters: parametersOf(table), returns: "" };
    else if (table.header[0] === "Field") types[section.name] = fieldsOf(table);
    else if (table.header.length > 0) continue;
    else if (membersOf(section.html).length > 0) unions[section.name] = membersOf(section.html);
    // A type with no table and no members holds nothing, such as ForumTopicClosed.
    else types[section.name] = {};
  }
  const known = new Set([...Object.keys(types), ...Object.keys(unions)]);
  for (const section of sections) {
    const method = methods[section.name];
    if (method) method.returns = returnsOf(section.html, known);
  }
  return { version, types: sorted(types), unions: sorted(unions), methods: sorted(methods) };
}

/** Every `<h4>` section after the changelog and the guide, which end where "Getting updates" starts. */
function sectionsOf(html: string): { name: string; html: string }[] {
  const start = html.indexOf('name="getting-updates"');
  if (start === -1) throw new Error("the Bot API page has no Getting updates section");
  const body = html.slice(start);
  const heads = [...body.matchAll(SECTION)];
  return heads.map((head, index) => ({
    name: decode(head[1]!).trim(),
    html: body.slice(head.index! + head[0].length, heads[index + 1]?.index ?? body.length),
  }));
}

function fieldsOf(table: { rows: string[][] }): Record<string, BotApiField> {
  return Object.fromEntries(table.rows.map(([name, type, description]) => {
    const value = /\balways “([^”]+)”/.exec(description ?? "")?.[1];
    return [name!, { type: type!, required: !/^Optional\b/.test(description ?? ""), ...(value ? { value } : {}) }];
  }));
}

function parametersOf(table: { header: string[]; rows: string[][] }): Record<string, BotApiField> {
  if (table.header[0] !== "Parameter") return {};
  return Object.fromEntries(table.rows.map(([name, type, required]) => [name!, { type: type!, required: required === "Yes" }]));
}

/**
 * The types a table-less section lists right after its description, however
 * it words it ("can be one of", "should be one of", "the following 6 types"):
 * a list whose every item is a link to a type is the union's members.
 */
function membersOf(html: string): string[] {
  const list = /^\s*<p>[\s\S]*?<\/p>\s*<ul>([\s\S]*?)<\/ul>/.exec(html)?.[1];
  if (!list) return [];
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((item) => item[1]!.trim());
  const members = items.map((item) => /^<a href="#[a-z0-9]+">([A-Z]\w*)<\/a>$/.exec(item)?.[1]);
  return members.every(Boolean) ? (members as string[]) : [];
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
function returnsOf(html: string, types: ReadonlySet<string>): string {
  const description = (html.split("<table")[0] ?? "").replace(/<\/?p>/g, " ");
  for (const sentence of description.split(/\.\s+(?=[A-Z<])/)) {
    if (!/Returns|returned|returns/.test(sentence)) continue;
    // Every alternative the sentence names, as editMessageText's "the edited Message ... otherwise True".
    const found = [...sentence.matchAll(/(Array of )?<a href="#[a-z0-9]+">([A-Z]\w*)<\/a>|<em>(True|Int|Integer|String|Boolean)<\/em>/g)].flatMap((match) => {
      if (match[2]) return types.has(match[2]) ? [`${match[1] ? "Array of " : ""}${match[2]}`] : [];
      return [match[3] === "Int" ? "Integer" : match[3]!];
    });
    const alternatives = [...new Set(found)];
    if (alternatives.length > 0) return alternatives.join(" or ");
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
