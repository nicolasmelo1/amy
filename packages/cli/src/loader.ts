import { Plugin } from "@amy/core";

/**
 * The plugins a fresh install runs with.
 *
 * Listed here rather than hidden in the wiring, so `amy plugin list` can show
 * them and a config can drop one. Order matters only in that a plugin reads
 * contributions when it is used, not when it is mounted, so it mostly does
 * not.
 */
/**
 * The plugins compiled into the binary, by name.
 *
 * A table of literal `import()` calls, and it has to be literal: the bundler
 * follows a specifier it can read and cannot follow a variable. `import(spec)`
 * alone works perfectly from a checkout and produces a binary with no plugin
 * in it at all, which is the kind of break that passes every test.
 *
 * Third-party plugins are still resolved from disk at run time, below. This
 * table is what ships in the box, not a list of what is allowed.
 *
 * `@amy/plugin-file-log` is deliberately absent despite the name: it is a
 * host service the CLI constructs itself, exports no `plugin`, and is already
 * bundled through a static import. Listing it here would only produce a
 * mounting problem naming a package that was never meant to mount.
 */
const BUILT_INS = {
  // The workflow is a plugin like anything else: it registers the order its
  // states happen in, and contributes how each of its actions runs. An
  // install that drops it has an engine with nothing to drive, and says so.
  "@amy/workflow-ticket-to-qa": () => import("@amy/workflow-ticket-to-qa"),
  "@amy/plugin-file-queue": () => import("@amy/plugin-file-queue"),
  "@amy/plugin-file-store": () => import("@amy/plugin-file-store"),
  "@amy/plugin-linear": () => import("@amy/plugin-linear"),
  "@amy/plugin-github": () => import("@amy/plugin-github"),
  "@amy/plugin-claude": () => import("@amy/plugin-claude"),
  "@amy/plugin-codex": () => import("@amy/plugin-codex"),
  "@amy/plugin-hermes-agent": () => import("@amy/plugin-hermes-agent"),
  "@amy/plugin-agent-relay": () => import("@amy/plugin-agent-relay"),
  "@amy/plugin-command-gate": () => import("@amy/plugin-command-gate"),
  "@amy/plugin-notify-fanout": () => import("@amy/plugin-notify-fanout"),
  "@amy/plugin-notify-hermes": () => import("@amy/plugin-notify-hermes"),
  "@amy/plugin-notify-inbox": () => import("@amy/plugin-notify-inbox"),
  "@amy/plugin-serial-engine": () => import("@amy/plugin-serial-engine"),
} satisfies Record<string, () => Promise<unknown>>;

/** Which plugins the binary carries, for `amy plugin list` to be honest. */
export const COMPILED_IN: readonly string[] = Object.keys(BUILT_INS);

export const DEFAULT_PLUGINS: readonly (keyof typeof BUILT_INS)[] = [
  "@amy/workflow-ticket-to-qa",
  "@amy/plugin-file-queue",
  "@amy/plugin-file-store",
  "@amy/plugin-linear",
  "@amy/plugin-github",
  "@amy/plugin-claude",
  "@amy/plugin-codex",
  "@amy/plugin-hermes-agent",
  // The only thing that mounts the `agent` port. The harnesses above merely
  // contribute themselves to it, so dropping this from a config leaves every
  // agent action without a port and the mount is refused at boot.
  "@amy/plugin-agent-relay",
  "@amy/plugin-command-gate",
  "@amy/plugin-notify-fanout",
  "@amy/plugin-notify-hermes",
  "@amy/plugin-notify-inbox",
  "@amy/plugin-serial-engine",
];

export interface LoadResult {
  plugins: Plugin[];
  problems: string[];
}

/**
 * Imports each plugin and takes its `plugin` export.
 *
 * A built-in comes from the table above, so it works in a binary with no
 * `node_modules` anywhere near it. Anything else is imported by name at run
 * time: a package the package manager put on disk, or a path. Resolution of
 * those is not this function's job, which is why installing is a separate
 * step.
 */
export async function load(specs: readonly string[]): Promise<LoadResult> {
  const plugins: Plugin[] = [];
  const problems: string[] = [];

  for (const spec of specs) {
    try {
      const importer = BUILT_INS[spec as keyof typeof BUILT_INS] ?? (() => import(spec));
      const module = (await importer()) as { plugin?: Plugin };
      if (!module.plugin) {
        problems.push(`${spec}: imported, but exports no \`plugin\``);
        continue;
      }
      plugins.push(module.plugin);
    } catch (error) {
      problems.push(
        `${spec}: could not be imported — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { plugins, problems };
}
