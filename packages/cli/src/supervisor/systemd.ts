import fs from "node:fs";
import path from "node:path";
import type { LoopSpec, MachineFacts, Supervisor } from "./index.js";

/**
 * Whether systemd --user works here, and whether the person lingers (S33,
 * S34). WSL may have no working systemd at all; a user who does not linger
 * has their services stopped at logout and none started at boot.
 */
export async function systemdState(machine: MachineFacts): Promise<{ operational: true; lingering: boolean } | { operational: false; why: string }> {
  const wsl = /microsoft|wsl/i.test(machine.procVersion ?? "");
  const running = await machine.runner.run("systemctl", ["--user", "is-system-running"]);
  // `degraded` is a working manager with a failed unit somewhere; `starting` one still booting.
  const state = running.stdout.trim();
  if (!["running", "degraded", "starting"].includes(state)) {
    const said = (running.stderr || running.stdout || "systemctl did not answer").trim();
    return { operational: false, why: `systemd --user is not working here${wsl ? " (WSL without systemd)" : ""}: ${said}` };
  }
  const linger = await machine.runner.run("loginctl", ["show-user", machine.user, "--property=Linger"]);
  return { operational: true, lingering: linger.stdout.trim() === "Linger=yes" };
}

/**
 * Linux: a systemd user unit. Restarted on failure, which a kill and a
 * restart's exit are and `amy stop`'s clean exit is not; started at boot
 * when the person lingers; and cleared of systemd's start limit before it is
 * started, so a loop that once restarted too fast is not left stopped (S33).
 */
export function systemd(machine: MachineFacts): Supervisor {
  const units = path.join(machine.env.XDG_CONFIG_HOME || path.join(machine.home, ".config"), "systemd", "user");
  const unit = (label: string) => `${label}.service`;
  const systemctl = (...args: string[]) => machine.runner.run("systemctl", ["--user", ...args]);

  return {
    name: "systemd",
    async start(spec: LoopSpec) {
      fs.mkdirSync(units, { recursive: true });
      fs.writeFileSync(path.join(units, unit(spec.label)), unitOf(spec), { mode: 0o644 });
      await systemctl("daemon-reload");
      await systemctl("reset-failed", unit(spec.label));
      const enabled = await systemctl("enable", "--now", unit(spec.label));
      if (!enabled.ok) throw new Error(`systemctl --user enable --now ${unit(spec.label)} failed: ${enabled.stderr || enabled.stdout}`);
    },
    async stop(label: string) {
      // Deregistered before it is stopped: a stop asked from the chat runs in
      // the unit's own cgroup, and stopping the unit may end it right there.
      await systemctl("disable", unit(label));
      fs.rmSync(path.join(units, unit(label)), { force: true });
      await systemctl("daemon-reload");
      await systemctl("stop", unit(label));
      await systemctl("reset-failed", unit(label));
    },
    async installed(label: string) {
      return fs.existsSync(path.join(units, unit(label)));
    },
  };
}

/** The unit file, every argument quoted the way systemd reads it. */
export function unitOf(spec: LoopSpec): string {
  return [
    "[Unit]",
    `Description=${spec.description}`,
    // No start limit: a unit that hit one stays stopped until somebody resets
    // it, and the loop must come back. RestartSec spaces the attempts instead.
    "StartLimitIntervalSec=0",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${[spec.program, ...spec.args].map((arg) => quoted(arg)).join(" ")}`,
    // A path, read as written: systemd takes no quotes here.
    `WorkingDirectory=${spec.workingDirectory.replace(/%/g, "%%")}`,
    // Environment= expands specifiers but not variables: a literal $ stays one.
    ...Object.entries(spec.env).map(([key, value]) => `Environment=${quoted(`${key}=${value}`, false)}`),
    "Restart=on-failure",
    "RestartSec=10",
    "KillMode=mixed",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** A double-quoted word, with what systemd would expand escaped: `%` specifiers and `$` variables. */
function quoted(value: string, variables = true): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%");
  return `"${variables ? escaped.replace(/\$/g, "$$$$") : escaped}"`;
}
