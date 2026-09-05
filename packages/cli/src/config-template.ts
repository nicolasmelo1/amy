/**
 * One settings surface: what a block of the config accepts, and where it is.
 *
 * `accepts` is the defaults object rather than a list of names, so the source
 * of truth is the thing the loader actually merges over. A setting added
 * there and nowhere else is exactly the case this catches.
 */
export interface SettingsSurface {
  /** Where the block sits, dotted. Empty for the top level. */
  readonly at: string;
  readonly accepts: object;
  /** The block as the template set it, or undefined if it set none. */
  readonly given: object | undefined;
}

/**
 * Whether the config `amy init` writes is one this build can read, and one
 * that names every setting there is.
 *
 * Two failures, and both of them shipped before this existed.
 *
 * The loud one: the template carried `agent:` twice. YAML refuses a duplicate
 * key rather than merging it, so `amy init` wrote a file `loadConfig` threw
 * on, and the next command anybody ran died. No test had ever parsed the
 * template — only the roster beside it.
 *
 * The quiet one: `pollBackoffMs` was configurable for its whole life and
 * appeared nowhere, so the only way to find it was to read the source. A
 * setting nobody can discover is a setting that does not exist, and the cost
 * lands on whoever concludes the machine cannot do what it does.
 *
 * Naming is enough for the second one. A setting commented out with the
 * reason is documented, and several of them are only worth turning on
 * deliberately.
 */
export function checkConfigTemplate(
  template: string,
  surfaces: readonly SettingsSurface[],
  parseErrors: readonly string[],
): string[] {
  const problems = parseErrors.map(
    (error) =>
      `the template does not parse, so \`amy init\` writes a file nothing can read — ${error}`,
  );

  // Everything below reads the parsed document, so a template that does not
  // parse is reported once rather than as a cascade of missing blocks.
  if (problems.length > 0) return problems;

  // Every word in the template, once. A name is looked up here rather than
  // matched with a pattern built from it, which is both stricter than a
  // substring — `ladder` would otherwise be satisfied by `ladderByStep` — and
  // one pass instead of one per setting.
  const namesInTemplate = new Set(template.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);

  for (const surface of surfaces) {
    for (const key of Object.keys(surface.given ?? {})) {
      if (!Object.hasOwn(surface.accepts, key)) {
        problems.push(
          `\`${named(surface.at, key)}\` is in the template and is not a setting — nothing would read it`,
        );
      }
    }

    for (const key of Object.keys(surface.accepts)) {
      if (!namesInTemplate.has(key)) {
        problems.push(
          `\`${named(surface.at, key)}\` is a setting and the template never names it — nobody can find it`,
        );
      }
    }
  }

  return problems;
}

function named(at: string, key: string): string {
  return at ? `${at}.${key}` : key;
}
