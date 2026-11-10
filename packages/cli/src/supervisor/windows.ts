import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { escapeXml } from "./launchd.js";
import type { LoopSpec, MachineFacts, Supervisor } from "./index.js";

/**
 * Windows: a scheduled task (S35), registered for the person with no
 * elevation and started at logon after a short delay. It starts amy through
 * wscript, which has no console (S36), and the launcher is what restarts the
 * loop: Task Scheduler's own RestartOnFailure covers a task that fails to
 * start, not a process that dies later, so the launcher runs the loop again
 * after an exit that is not clean, a counted number of times (S37).
 * Installing it removes a Startup entry, so nothing starts twice (S40); the
 * Startup folder is used only when the task cannot be registered.
 */
export function taskScheduler(machine: MachineFacts): Supervisor {
  const startup = path.join(machine.env.APPDATA || path.join(machine.home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const task = (label: string) => `\\amy\\${label}`;
  const schtasks = (...args: string[]) => machine.runner.run("schtasks", args);
  const user = machine.env.USERDOMAIN ? `${machine.env.USERDOMAIN}\\${machine.user}` : machine.user;

  return {
    name: "task-scheduler",
    async start(spec: LoopSpec) {
      fs.mkdirSync(spec.directory, { recursive: true });
      fs.rmSync(stopMarker(spec.directory, spec.label), { force: true });
      const launcher = path.join(spec.directory, `${spec.label}.vbs`);
      fs.writeFileSync(launcher, launcherOf(spec), "utf-8");
      const xml = path.join(spec.directory, `${spec.label}.xml`);
      // Task Scheduler reads a task's XML as UTF-16, as it writes it.
      fs.writeFileSync(xml, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskOf(spec, user, launcher), "utf16le")]));
      const created = await schtasks("/Create", "/TN", task(spec.label), "/XML", xml, "/F");
      fs.rmSync(xml, { force: true });
      if (!created.ok) {
        // Never both: the Startup folder only when no task could be registered.
        fs.mkdirSync(startup, { recursive: true });
        fs.copyFileSync(launcher, path.join(startup, `${spec.label}.vbs`));
        // Started now and left running: the launcher waits on the loop, and
        // restarts it, for as long as it runs.
        const child = spawn("wscript.exe", [launcher], { detached: true, stdio: "ignore", windowsHide: true });
        child.on("error", () => undefined);
        child.unref();
        return;
      }
      fs.rmSync(path.join(startup, `${spec.label}.vbs`), { force: true });
      const run = await schtasks("/Run", "/TN", task(spec.label));
      if (!run.ok) throw new Error(`schtasks /Run ${task(spec.label)} failed: ${run.stderr || run.stdout}`);
    },
    async stop(label: string) {
      // Said first, to a launcher that outlives its task or runs from the
      // Startup folder: a loop that exits from now on is not started again.
      const directory = supervisorDirectory(machine);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(stopMarker(directory, label), "", "utf-8");
      await schtasks("/End", "/TN", task(label));
      await schtasks("/Delete", "/TN", task(label), "/F");
      fs.rmSync(path.join(startup, `${label}.vbs`), { force: true });
    },
    async installed(label: string) {
      return (await schtasks("/Query", "/TN", task(label))).ok || fs.existsSync(path.join(startup, `${label}.vbs`));
    },
  };
}

/** Where the launcher looks before it starts a loop again: present, it stops. */
function stopMarker(directory: string, label: string): string {
  return path.join(directory, `${label}.stopped`);
}

/** Where amy keeps what a supervisor needs, under its state directory. */
function supervisorDirectory(machine: MachineFacts): string {
  return path.join(machine.env.AMY_HOME || path.join(machine.home, ".amy"), "supervisor");
}

/** How many times the launcher starts a loop that did not exit cleanly before it gives up. */
const MAX_RESTARTS = 255;

/** How long it waits before starting it again. */
const RESTART_PAUSE_MS = 5000;

/** The task: at logon, delayed, no elevation, no time limit, on battery too, restarted when it fails. */
export function taskOf(spec: LoopSpec, user: string, launcher: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-16"?>`,
    `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">`,
    `  <RegistrationInfo><Description>${escapeXml(spec.description)}</Description></RegistrationInfo>`,
    `  <Triggers>`,
    `    <LogonTrigger><Enabled>true</Enabled><UserId>${escapeXml(user)}</UserId><Delay>PT30S</Delay></LogonTrigger>`,
    `  </Triggers>`,
    `  <Principals>`,
    `    <Principal id="Author"><UserId>${escapeXml(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>`,
    `  </Principals>`,
    `  <Settings>`,
    `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`,
    `    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>`,
    `    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>`,
    `    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>`,
    `    <StartWhenAvailable>true</StartWhenAvailable>`,
    `    <RestartOnFailure><Interval>PT1M</Interval><Count>255</Count></RestartOnFailure>`,
    `    <Enabled>true</Enabled>`,
    `  </Settings>`,
    `  <Actions Context="Author">`,
    `    <Exec><Command>wscript.exe</Command><Arguments>${escapeXml(`"${launcher}"`)}</Arguments><WorkingDirectory>${escapeXml(spec.workingDirectory)}</WorkingDirectory></Exec>`,
    `  </Actions>`,
    `</Task>`,
    ``,
  ].join("\r\n");
}

/**
 * The console-less launcher: sets amy's environment and runs the loop hidden,
 * waiting on it; a clean exit ends it, any other runs the loop again after a
 * pause, up to a count, and the last exit is handed back to the task.
 */
export function launcherOf(spec: LoopSpec): string {
  const vbs = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const command = [spec.program, ...spec.args].map((arg) => `""${arg.replace(/"/g, '""""')}""`).join(" ");
  return [
    `Set shell = CreateObject("WScript.Shell")`,
    `Set environment = shell.Environment("PROCESS")`,
    ...Object.entries(spec.env).map(([key, value]) => `environment(${vbs(key)}) = ${vbs(value)}`),
    `shell.CurrentDirectory = ${vbs(spec.workingDirectory)}`,
    `Set files = CreateObject("Scripting.FileSystemObject")`,
    `stopped = ${vbs(path.join(spec.directory, `${spec.label}.stopped`))}`,
    `failures = 0`,
    `Do`,
    `  code = shell.Run("${command}", 0, True)`,
    `  If code = 0 Then Exit Do`,
    `  If files.FileExists(stopped) Then Exit Do`,
    `  failures = failures + 1`,
    `  If failures >= ${MAX_RESTARTS} Then Exit Do`,
    `  WScript.Sleep ${RESTART_PAUSE_MS}`,
    `  If files.FileExists(stopped) Then Exit Do`,
    `Loop`,
    `WScript.Quit code`,
    ``,
  ].join("\r\n");
}
