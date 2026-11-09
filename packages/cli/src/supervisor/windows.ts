import fs from "node:fs";
import path from "node:path";
import { escapeXml } from "./launchd.js";
import type { LoopSpec, MachineFacts, Supervisor } from "./index.js";

/**
 * Windows: a scheduled task (S35). Registered for the person with no
 * elevation, started at logon after a short delay and again when it fails,
 * a counted number of times (S37). It starts amy through wscript, which has
 * no console: a loop under cmd.exe is sent a close event at logon, which
 * Task Scheduler reads as the person cancelling it and never restarts (S36).
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
        const started = await machine.runner.run("wscript.exe", [launcher]);
        if (!started.ok) throw new Error(`schtasks refused ${spec.label} (${created.stderr || created.stdout}), and its Startup entry did not start`);
        return;
      }
      fs.rmSync(path.join(startup, `${spec.label}.vbs`), { force: true });
      const run = await schtasks("/Run", "/TN", task(spec.label));
      if (!run.ok) throw new Error(`schtasks /Run ${task(spec.label)} failed: ${run.stderr || run.stdout}`);
    },
    async stop(label: string) {
      await schtasks("/End", "/TN", task(label));
      await schtasks("/Delete", "/TN", task(label), "/F");
      fs.rmSync(path.join(startup, `${label}.vbs`), { force: true });
    },
    async installed(label: string) {
      return (await schtasks("/Query", "/TN", task(label))).ok || fs.existsSync(path.join(startup, `${label}.vbs`));
    },
  };
}

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

/** The console-less launcher: sets amy's environment, runs the loop hidden, waits, and hands back its exit. */
export function launcherOf(spec: LoopSpec): string {
  const vbs = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const command = [spec.program, ...spec.args].map((arg) => `""${arg.replace(/"/g, '""""')}""`).join(" ");
  return [
    `Set shell = CreateObject("WScript.Shell")`,
    `Set environment = shell.Environment("PROCESS")`,
    ...Object.entries(spec.env).map(([key, value]) => `environment(${vbs(key)}) = ${vbs(value)}`),
    `shell.CurrentDirectory = ${vbs(spec.workingDirectory)}`,
    `code = shell.Run("${command}", 0, True)`,
    `WScript.Quit code`,
    ``,
  ].join("\r\n");
}
