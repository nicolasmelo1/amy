import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SecretSources {
  env: NodeJS.ProcessEnv;
  readFile: (file: string) => string;
}

const FROM_DISK: SecretSources = {
  env: process.env,
  readFile: (file) => fs.readFileSync(file, "utf8"),
};

/**
 * The bot token, from where the config says it lives.
 *
 * `env:<NAME>` or `file:<path>#<KEY>`, and nothing else. A token written into
 * `config.yaml` itself is refused rather than used, because that file is the
 * one people paste into an issue when something breaks.
 */
export function resolveToken(ref: string, sources: SecretSources = FROM_DISK): string {
  if (ref.startsWith("env:")) {
    const name = ref.slice("env:".length);
    const value = sources.env[name];
    if (!value) throw new Error(`@amykit/plugin-slack: \`token\` names ${name}, which is not set`);
    return value;
  }

  if (ref.startsWith("file:")) {
    const [file = "", key = ""] = ref.slice("file:".length).split("#");
    if (!file || !key) {
      throw new Error("@amykit/plugin-slack: `token` must be `file:<path>#<KEY>`, naming the key inside the file");
    }
    const value = keyIn(sources.readFile(expandHome(file)), key);
    if (!value) throw new Error(`@amykit/plugin-slack: ${file} has no ${key}`);
    return value;
  }

  throw new Error(
    "@amykit/plugin-slack: `token` must say where the token lives — `env:SLACK_BOT_TOKEN` or " +
      "`file:<path>#<KEY>` — and is never written into the config itself",
  );
}

/** One `KEY=value` line of a dotenv-shaped file, quotes stripped. */
function keyIn(text: string, key: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals === -1) continue;
    const name = line.slice(0, equals).trim().replace(/^export\s+/, "");
    if (name !== key) continue;
    return unquote(line.slice(equals + 1).trim());
  }
  return undefined;
}

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote) ? value.slice(1, -1) : value;
}

function expandHome(file: string): string {
  return file === "~" || file.startsWith("~/") ? path.join(os.homedir(), file.slice(1)) : file;
}
