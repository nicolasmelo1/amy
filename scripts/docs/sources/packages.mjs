import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceDirectories } from "../lib/repo.mjs";

/**
 * A throwaway directory the introspected plugins may write into.
 *
 * A plugin that keeps files creates its directory in `register`, and pointing
 * that at the workspace would leave the generator's litter in the repository
 * it is documenting. Made once, removed once, and never anywhere a checkout
 * can see it.
 */
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "amy-docs-"));

/**
 * What a plugin registers, found by registering it.
 *
 * Nothing here reads a manifest a maintainer has to keep in step. Each plugin
 * is handed a registry that only writes down what it is asked for, and a
 * context holding the settings its own schema declares. That means the
 * reference tables say what the code does rather than what somebody last
 * remembered to write, which is the whole point of generating them.
 */
export async function packageFacts() {
  const found = [];

  try {
    for (const { group, dir, entry } of workspaceDirectories()) {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const environment = environmentOf(dir);

      found.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? "",
        private: manifest.private === true,
        group,
        directory: `${group}/${entry}`,
        dependencies: Object.keys(manifest.dependencies ?? {}).sort(),
        amyDependencies: Object.keys(manifest.dependencies ?? {})
          .filter((name) => name.startsWith("@amykit/"))
          .sort(),
        environment,
        ...(await introspect(dir, manifest, environment)),
      });
    }

    return found;
  } finally {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  }
}

/**
 * The environment variables a package reads, found by reading it.
 *
 * A hand-kept list of these would be the first thing to go out of date, and
 * the symptom is the worst kind: a credential nobody documented, discovered
 * when a mount refuses at three in the morning. It is also what makes
 * introspection possible below — a plugin that throws without a key is given
 * a placeholder for exactly the keys it names.
 */
function environmentOf(dir) {
  const src = path.join(dir, "src");
  if (!fs.existsSync(src)) return [];

  const names = new Set();

  for (const file of sourceFiles(src)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\["([A-Z][A-Z0-9_]*)"\])/g)) {
      names.add(match[1] ?? match[2]);
    }
  }

  return [...names].sort();
}

function sourceFiles(from) {
  const found = [];

  for (const entry of fs.readdirSync(from).sort()) {
    const full = path.join(from, entry);
    if (fs.statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) found.push(full);
  }

  return found;
}

/** Loads the built package and asks it what it is. */
async function introspect(dir, manifest, environment) {
  const main = manifest.main ?? "./dist/index.js";
  const entry = path.join(dir, main);

  if (!fs.existsSync(entry)) {
    return { kind: "unbuilt", problem: `${main} is not built — run \`npm run build\`` };
  }

  // The CLI's entry point *is* the command: importing it parses argv and
  // exits. Nothing in it is introspected, so it is never loaded.
  if (manifest.name === "@amykit/cli") return { kind: "cli" };

  let module;
  try {
    module = await import(pathToFileURL(entry).href);
  } catch (error) {
    return { kind: "unloadable", problem: message(error) };
  }

  if (!module.plugin) return { kind: "library", exports: Object.keys(module).sort() };

  return {
    kind: manifest.name.includes("/workflow-") ? "workflow" : "plugin",
    exports: Object.keys(module).sort(),
    settings: settingsOf(module.plugin),
    ...(await registers(module.plugin, environment)),
    ...workflowShape(module),
  };
}

/** One row per setting, from the schema the plugin declares to the host. */
function settingsOf(plugin) {
  return Object.entries(plugin.configSchema ?? {})
    .map(([name, field]) => ({
      name,
      type: field.type,
      required: field.required === true,
      default: field.default,
      description: field.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Registers the plugin against a registry that only takes notes.
 *
 * `register` is called and `ready` is not. `register` is where a plugin says
 * what it is; `ready` is where it judges a configuration against the rest of
 * a real host, and there is no real host here.
 */
async function registers(plugin, environment) {
  const seen = {
    mounts: [],
    contributes: [],
    addsActions: [],
    observes: [],
    mountsEngine: false,
    mountsWorkflow: null,
  };

  const registry = {
    queue: () => seen.mounts.push("queue"),
    store: () => seen.mounts.push("store"),
    engine: () => {
      seen.mountsEngine = true;
    },
    workflow: (workflow) => {
      seen.mountsWorkflow = workflow.name;
    },
    port: (kind) => seen.mounts.push(kind),
    action: (name, spec) => {
      seen.addsActions.push({ name, port: spec.port, method: spec.method });
      if (!seen.mounts.includes(spec.port)) seen.mounts.push(spec.port);
    },
    observer: (slice) => seen.observes.push(slice),
    contribute: (collection, name) => seen.contributes.push({ collection, name }),
  };

  const restore = placeholders(environment);
  try {
    await plugin.register(registry, contextFor(plugin));
  } catch (error) {
    // A plugin that will not register against a stand-in host is reported as
    // such rather than dropped: a reference page missing a plugin looks
    // exactly like a plugin that does not exist.
    return { ...sorted(seen), registerProblem: message(error) };
  } finally {
    restore();
  }

  return sorted(seen);
}

/**
 * A stand-in value for every environment variable the package reads.
 *
 * An adapter that refuses to mount without a credential is right to, and it
 * still has to be able to say what it mounts. Only names the package itself
 * reads are set, only for the length of one `register`, and never over a
 * value the caller already had — so running the generator on a machine with
 * a real key in the environment neither uses it nor loses it.
 */
function placeholders(names) {
  const set = names.filter((name) => process.env[name] === undefined);
  for (const name of set) process.env[name] = "docs-generator-placeholder";

  return () => {
    for (const name of set) delete process.env[name];
  };
}

function sorted(seen) {
  return {
    mounts: [...seen.mounts].sort(),
    contributes: [...seen.contributes].sort((a, b) =>
      `${a.collection}${a.name}`.localeCompare(`${b.collection}${b.name}`),
    ),
    addsActions: [...seen.addsActions].sort((a, b) => a.name.localeCompare(b.name)),
    observes: [...seen.observes].sort(),
    mountsEngine: seen.mountsEngine,
    mountsWorkflow: seen.mountsWorkflow,
  };
}

/**
 * The context a plugin sees while it is being asked what it is.
 *
 * Every setting takes its declared default, or a value of the declared type
 * where there is none, so a required field does not stop a plugin describing
 * itself. Nothing here touches the disk or the network, and the environment
 * is filled with obvious placeholders so an adapter that refuses to mount
 * without a credential can still say what it mounts.
 */
function contextFor(plugin) {
  const config = {};
  for (const [name, field] of Object.entries(plugin.configSchema ?? {})) {
    config[name] = field.default !== undefined ? field.default : sample(field.type);
  }

  return {
    config,
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date(0),
    log: { append() {}, read: () => [] },
    paths: { workspace: SCRATCH, state: SCRATCH },
    contributions: () => new Map(),
    port: () => ({}),
    workflow: () => undefined,
  };
}

function sample(type) {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string[]":
      return [];
    default:
      return {};
  }
}

/** A workflow package also exports its machine, which is where its shape is. */
function workflowShape(module) {
  const machine = Object.values(module).find(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      typeof value.plan === "function" &&
      Array.isArray(value.states),
  );

  if (!machine) return {};

  return {
    workflow: {
      name: machine.name,
      states: [...machine.states],
      waitingStates: [...machine.waitingStates],
      terminalStates: [...machine.terminalStates],
      initialState: machine.initialState,
      usesActions: [...machine.usesActions].sort(),
      usesObservers: [...machine.usesObservers].sort(),
    },
  };
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
