import fs from "node:fs";
import path from "node:path";
import { AmyConfig, loadConfig, removeProfile } from "./config.js";
import { Profile } from "./profiles.js";
import { profileOwnedDirectories } from "./paths.js";
import { stillMounted } from "./remove.js";

/** What removing a profile needs from the process that asked. */
export interface RemovalDeps {
  /** The loop driving this profile, when one is. */
  running(profile: Profile): { workflow: string; pid: number } | undefined;
  /** Whether a scheduled update still owns this profile. */
  pendingUpdate(profile: Profile): boolean;
  /** Uninstalls a package the config no longer names. */
  uninstall(spec: string): Promise<void>;
  /** Asks before deleting state, and answers for a terminal nobody is at. */
  confirm(directories: readonly string[]): boolean;
  say(line: string): void;
}

/**
 * Forgets one profile: its config block, its package, and — only when asked —
 * the records and queue it kept.
 *
 * A profile and the package it names are one thing to the operator: `amy
 * remove ticket-to-qa` is the reverse of the `amy add` that wrote the block,
 * and asking two commands to undo one is how state gets left behind.
 *
 * The log is never on the list. It is append-only because the budget is
 * measured off it, so deleting what a workflow spent would move a ceiling
 * rather than tidy a directory.
 */
export async function removeProfileAndState(
  home: string,
  config: AmyConfig,
  profile: Profile,
  options: { keepState?: boolean; yes?: boolean },
  deps: RemovalDeps,
): Promise<"deleted" | "kept"> {
  const live = deps.running(profile);
  if (live) throw new Error(`${live.workflow} is running as pid ${live.pid}. Run \`amy stop\` first.`);
  if (deps.pendingUpdate(profile)) {
    throw new Error(`${profile.name} has a scheduled daemon update. Let it settle before removing it.`);
  }

  const going = profileOwnedDirectories(home, profile).filter((directory) => fs.existsSync(directory));
  const deleting = options.keepState !== true && (options.yes === true || going.length === 0 || deps.confirm(going));

  for (const directory of going) {
    const held = fs.readdirSync(directory).length;
    deps.say(`${deleting ? "deleting" : "keeping"} ${path.relative(home, directory)} (${held} file(s))`);
  }

  removeProfile(home, profile.name, config);
  deps.say(`removed the \`${profile.name}\` profile for ${profile.workflow}`);
  if (!stillMounted(loadConfig(home), profile.workflow)) await deps.uninstall(profile.workflow);

  if (deleting) {
    for (const directory of going) fs.rmSync(directory, { recursive: true, force: true });
  } else {
    deps.say(`kept the state under ${profile.name}/: add --yes to delete it, or leave it for \`amy add\` to pick up`);
  }
  deps.say(`The log keeps what ${profile.name} did: nothing here touches it.`);
  return deleting ? "deleted" : "kept";
}

