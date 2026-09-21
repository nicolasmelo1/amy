import fs from "node:fs";
import path from "node:path";
import { CommandRunner } from "@amykit/core";

/**
 * The package manager, by the name this platform actually has for it.
 *
 * `spawn` without a shell will not find `npm` on Windows, because what is on
 * the PATH there is `npm.cmd`. Getting this wrong is not a subtle failure —
 * it is `ENOENT` on the one command that was supposed to make installing
 * easy — but it is invisible on the machine most of this was written on.
 */
export function packageManager(platform: string = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export interface InstallOutcome {
  ok: boolean;
  /** What was run, so a failure can be retried by hand. */
  command: string;
  output: string;
}

/**
 * Installs packages into amy's own npm root — `<home>/plugins`.
 *
 * A plugin is resolved by name at run time, but not by walking up from this
 * file: amy's loader resolves through that root explicitly, so the packages
 * belong to amy's state directory rather than to a global prefix every other
 * tool on the machine shares. A plugin installed here is one `npm install -g`
 * never has to be asked about, and `npm prefix -g` can point anywhere without
 * amy caring.
 *
 * Ten minutes rather than the runner's default, because a cold npm cache on a
 * slow connection is not a hang, and killing it half way leaves a root
 * somebody has to repair by hand.
 */
export async function installIntoPluginsRoot(
  runner: CommandRunner,
  root: string,
  packages: readonly string[],
): Promise<InstallOutcome> {
  const args = ["install", "--prefix", root, "--no-audit", "--no-fund", ...packages];
  const command = `${packageManager()} ${args.join(" ")}`;

  const result = await runner.run(packageManager(), args, { timeoutMs: 10 * 60 * 1000 });

  return {
    ok: result.ok,
    command,
    // Both streams: npm says the interesting part on stderr about half the
    // time, and a summary that drops the line that mattered is worse than
    // the noise.
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

/**
 * The manifest a plugin root resolves through, written before its first
 * install.
 *
 * npm reads the `package.json` it finds at the prefix; without one it walks
 * up looking for the nearest project, which on a scratch machine could be
 * anything. This makes the root a real, private npm root from the moment
 * amy needs it, and re-writing it loses nothing: it never carries anything
 * but amy's own word `private`.
 */
export function ensurePluginsRoot(root: string): string {
  const manifest = path.join(root, "package.json");
  if (!fs.existsSync(manifest)) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(manifest, `${JSON.stringify({ name: "amy-plugins", private: true }, null, 2)}\n`, "utf-8");
  }
  return root;
}