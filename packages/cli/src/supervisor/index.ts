import { createHash } from "node:crypto";
import { CommandRunner } from "@amykit/core";
import { launchd } from "./launchd.js";
import { systemd, systemdState } from "./systemd.js";
import { taskScheduler } from "./windows.js";

/**
 * The loop as the machine's supervisor runs it: one command, the environment
 * it needs, and where its output goes. Nothing secret is in it; amy reads
 * its own `.env` once it is running.
 */
export interface LoopSpec {
  /** Unique per state directory and workflow, so two installs never share a supervised loop. */
  readonly label: string;
  /** Said in the supervisor's own listing. */
  readonly description: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
  /** Where the loop's own output is appended; amy writes it, so every supervisor agrees. */
  readonly log: string;
  /** Where a supervisor that needs files of its own keeps them. */
  readonly directory: string;
}

/**
 * One contract, chosen by platform (S38): launchd, systemd --user, Task
 * Scheduler. A loop it runs that crashes or is killed is started again; one
 * that exits cleanly, which `amy stop` asks for, is not, and stopping removes
 * it so nothing starts it at the next boot or logon either.
 */
export interface Supervisor {
  readonly name: string;
  /** Installs the loop and starts it now. */
  start(spec: LoopSpec): Promise<void>;
  /** Stops it and removes it: nothing starts it again until `amy start`. */
  stop(label: string): Promise<void>;
  /** Whether a loop under this label is installed. */
  installed(label: string): Promise<boolean>;
}

/** The supervisor this machine has, or why there is none (S39). */
export type Found =
  | { ok: true; supervisor: Supervisor; detail: string; refuse?: string }
  | { ok: false; why: string };

/** What finding a supervisor reads of the machine, so a test can be any machine. */
export interface MachineFacts {
  readonly platform: NodeJS.Platform;
  readonly runner: CommandRunner;
  /** The person's home: LaunchAgents, systemd's user units and the Startup folder are under it. */
  readonly home: string;
  readonly user: string;
  readonly uid: number;
  readonly env: NodeJS.ProcessEnv;
  /** Read for WSL, which may run without a working systemd (S33). */
  readonly procVersion?: string;
}

/** Which supervisor runs loops here, asked of the machine; `AMY_SUPERVISOR=none` says there is none. */
export async function findSupervisor(machine: MachineFacts): Promise<Found> {
  if (machine.env.AMY_SUPERVISOR === "none") return { ok: false, why: "AMY_SUPERVISOR=none says this machine has none" };
  if (machine.platform === "darwin") {
    const supervisor = launchd(machine);
    return { ok: true, supervisor, detail: `launchd (${await supervisor.domain()}), which starts the loop again when it stops` };
  }
  if (machine.platform === "linux") {
    const state = await systemdState(machine);
    if (!state.operational) return { ok: false, why: state.why };
    const supervisor = systemd(machine);
    return state.lingering
      ? { ok: true, supervisor, detail: "systemd --user, lingering on, which starts the loop again when it stops and at boot" }
      : {
          ok: true,
          supervisor,
          detail: "systemd --user",
          refuse: `lingering is off for ${machine.user}: the loop stops at logout and nothing starts it at boot; run \`loginctl enable-linger ${machine.user}\``,
        };
  }
  if (machine.platform === "win32") {
    return { ok: true, supervisor: taskScheduler(machine), detail: "Task Scheduler, at logon and again when the loop fails" };
  }
  return { ok: false, why: `amy knows no supervisor on ${machine.platform}` };
}

/** One label per state directory and workflow, in the characters every supervisor takes. */
export function labelFor(stateDirectory: string, workflow: string): string {
  const install = createHash("sha256").update(stateDirectory).digest("hex").slice(0, 8);
  return `amy.${workflow.replace(/[^A-Za-z0-9_-]/g, "_")}.${install}`;
}

/** The exit a loop asks its supervisor for a restart with: not a success, so it is started again. */
export const RESTART_EXIT = 75;
