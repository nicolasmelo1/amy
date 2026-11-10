import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ChatMessage, CommandResult, CommandRunner, Conversation, NodeCommandRunner, answerTheChat } from "@amykit/core";
import { CHAT_COMMANDS, chatAct } from "../src/chat-action.js";
import { loadConfig } from "../src/config.js";
import { supervisorCheck } from "../src/doctor.js";
import { profilePaths } from "../src/paths.js";
import { resolveProfile } from "../src/profiles.js";
import { LoopSpec, MachineFacts, findSupervisor, labelFor } from "../src/supervisor/index.js";
import { plistOf } from "../src/supervisor/launchd.js";
import { unitOf } from "../src/supervisor/systemd.js";
import { launcherOf, taskOf } from "../src/supervisor/windows.js";

/** A machine whose commands answer from a script, by command and first arguments. */
function machineWith(platform: NodeJS.Platform, answers: Record<string, Partial<CommandResult>>, extra: Partial<MachineFacts> = {}): MachineFacts {
  const runner: CommandRunner = {
    run: async (command, args) => {
      const key = Object.keys(answers).find((one) => `${command} ${args.join(" ")}`.startsWith(one));
      return { ok: true, exitCode: 0, stdout: "", stderr: "", ...(key ? answers[key] : {}) };
    },
  };
  return { platform, runner, home: "/home/ada", user: "ada", uid: 1000, env: {}, ...extra };
}

const SPEC: LoopSpec = {
  label: "amy.billing.0a1b2c3d",
  description: "amy, driving billing",
  program: "/usr/local/bin/node",
  args: ["/opt/amy/index.js", "--workflow", "billing", "daemon", "--supervised", "--every", "60", "--log", "/state/daemon.log"],
  env: { AMY_HOME: "/state", PATH: "/usr/bin:/bin", HOME: "/home/ada" },
  workingDirectory: "/state",
  log: "/state/daemon.log",
  directory: "/state/supervisor",
};

describe("one supervisor contract, chosen by platform (A15)", () => {
  it("names launchd on macOS, in the GUI session where there is one", async () => {
    const found = await findSupervisor(machineWith("darwin", {}));
    expect(found).toMatchObject({ ok: true, supervisor: { name: "launchd" }, detail: "launchd (gui/1000), which starts the loop again when it stops" });
    expect(supervisorCheck(found)).toEqual({ label: "supervisor", ok: true, detail: "launchd (gui/1000), which starts the loop again when it stops" });
  });

  it("falls back to the background session over ssh", async () => {
    const found = await findSupervisor(machineWith("darwin", { "launchctl print gui/1000": { ok: false, exitCode: 113 } }));
    expect(found).toMatchObject({ ok: true, detail: expect.stringContaining("launchd (user/1000)") });
  });

  it("names systemd on Linux when the person lingers", async () => {
    const found = await findSupervisor(machineWith("linux", { "systemctl --user is-system-running": { stdout: "running\n" }, "loginctl show-user ada": { stdout: "Linger=yes\n" } }));
    expect(supervisorCheck(found)).toEqual({ label: "supervisor", ok: true, detail: "systemd --user, lingering on, which starts the loop again when it stops and at boot" });
  });

  it("refuses a Linux user with lingering off", async () => {
    const found = await findSupervisor(machineWith("linux", { "systemctl --user is-system-running": { stdout: "degraded\n", ok: false, exitCode: 1 }, "loginctl show-user ada": { stdout: "Linger=no\n" } }));
    expect(supervisorCheck(found)).toEqual({
      label: "supervisor",
      ok: false,
      detail: "systemd --user, but lingering is off for ada: the loop stops at logout and nothing starts it at boot; run `loginctl enable-linger ada`",
    });
  });

  it("names Task Scheduler on Windows", async () => {
    const found = await findSupervisor(machineWith("win32", {}));
    expect(found).toMatchObject({ ok: true, supervisor: { name: "task-scheduler" } });
  });

  it("says so when there is none, and that nothing brings a dead loop back", async () => {
    const wsl = await findSupervisor(machineWith("linux", { "systemctl --user is-system-running": { ok: false, exitCode: 1, stdout: "offline\n", stderr: "System has not been booted with systemd as init system (PID 1). Can't operate." } }, { procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2" }));
    expect(wsl).toEqual({ ok: false, why: "systemd --user is not working here (WSL without systemd): System has not been booted with systemd as init system (PID 1). Can't operate." });
    expect(supervisorCheck(wsl)).toEqual({ label: "supervisor", ok: true, detail: expect.stringMatching(/^none — systemd --user is not working here .*; amy start runs the loop detached, and nothing brings it back if it stops$/) });
    expect(await findSupervisor(machineWith("darwin", {}, { env: { AMY_SUPERVISOR: "none" } }))).toEqual({ ok: false, why: "AMY_SUPERVISOR=none says this machine has none" });
    expect(await findSupervisor(machineWith("aix", {}))).toEqual({ ok: false, why: "amy knows no supervisor on aix" });
  });

  it("labels a loop by its state directory and workflow, in characters every supervisor takes", () => {
    expect(labelFor("/state", "billing brief")).toMatch(/^amy\.billing_brief\.[0-9a-f]{8}$/);
    expect(labelFor("/state", "billing")).not.toBe(labelFor("/other", "billing"));
    expect(labelFor("/state", "billing prod")).not.toBe(labelFor("/state", "billing_prod"));
  });
});

describe("what each supervisor is handed", () => {
  it("keeps a launchd agent alive only when it did not exit cleanly, throttled, at load", () => {
    const plist = plistOf({ ...SPEC, env: { ...SPEC.env, NOTE: "a & b" } });
    expect(plist).toContain("<key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key><false/>");
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<key>ThrottleInterval</key><integer>30</integer>");
    expect(plist).toContain("<string>--supervised</string>");
    expect(plist).toContain("<key>NOTE</key><string>a &amp; b</string>");
  });

  it("restarts a systemd unit on failure, quoting what systemd would expand", () => {
    const unit = unitOf({ ...SPEC, args: [...SPEC.args, "50%", "$HOME"] });
    expect(unit).toContain("Restart=on-failure");
    // No start limit, which would leave the loop stopped until somebody reset it.
    expect(unit).toContain("StartLimitIntervalSec=0");
    expect(unit).toContain('ExecStart="/usr/local/bin/node" "/opt/amy/index.js"');
    expect(unit).toContain('"50%%" "$$HOME"');
    expect(unit).toContain('Environment="AMY_HOME=/state"');
    expect(unit).toContain("WorkingDirectory=/state\n");
    expect(unit).toContain("WantedBy=default.target");
  });

  it("starts a Windows task at logon with no elevation, restarted on failure a counted number of times, through a console-less launcher (A16)", () => {
    const task = taskOf(SPEC, "DESK\\ada", "C:\\state\\supervisor\\amy.billing.0a1b2c3d.vbs");
    expect(task).toContain("<LogonTrigger><Enabled>true</Enabled><UserId>DESK\\ada</UserId><Delay>PT30S</Delay></LogonTrigger>");
    expect(task).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(task).toContain("<RestartOnFailure><Interval>PT1M</Interval><Count>255</Count></RestartOnFailure>");
    expect(task).toContain("<Command>wscript.exe</Command><Arguments>&quot;C:\\state\\supervisor\\amy.billing.0a1b2c3d.vbs&quot;</Arguments>");
    const launcher = launcherOf(SPEC);
    expect(launcher).toContain('environment("AMY_HOME") = "/state"');
    expect(launcher).toContain('code = shell.Run("""/usr/local/bin/node"" ""/opt/amy/index.js"" ""--workflow""');
    expect(launcher).toContain(", 0, True)");
    expect(launcher).toContain("  If code = 0 Then Exit Do");
    expect(launcher).toContain("  If failures >= 255 Then Exit Do");
    expect(launcher).toContain(`stopped = "${path.join("/state/supervisor", "amy.billing.0a1b2c3d.stopped")}"`);
    // Asked again after the pause, so a stop said while it waits is heard before another start.
    expect(launcher).toMatch(/WScript\.Sleep 5000\r\n {2}If files\.FileExists\(stopped\) Then Exit Do/);
    expect(launcher).toContain("  If files.FileExists(stopped) Then Exit Do");
    expect(launcher).toContain("WScript.Quit code");
  });
});

describe("with no working systemd, a restart is refused and the chat still answers (A17)", () => {
  it("refuses /action restart naming why, keeping the loop's pid, and answers the next ask", async () => {
    const found = await findSupervisor(machineWith("linux", { "systemctl --user is-system-running": { ok: false, exitCode: 1, stdout: "offline\n", stderr: "Failed to connect to bus: No medium found" } }));
    expect(found.ok).toBe(false);
    const exits: string[] = [];
    const ran: string[][] = [];
    const said: string[] = [];
    const pending: ChatMessage[] = [];
    const conversation: Conversation = {
      open: async () => ({ id: "x" }), post: async () => "x", replies: async () => [],
      chat: async () => [...pending],
      settle: async (id) => void pending.splice(pending.findIndex((one) => one.id === id), 1),
      say: async (_place, text) => {
        said.push(text);
        return String(said.length);
      },
    };
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-no-systemd-"));
    const act = chatAct({
      runner: { run: async (_command, args) => (ran.push([...args]), { ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      amy: ["node", "/amy.js"], workflow: "billing", config: path.join(home, "config.yaml"), restartMarker: path.join(home, "restart.json"),
      unsupervised: found.ok ? undefined : found.why,
      pid: 4242,
      exit: async (how) => void exits.push(how),
    });
    const answers = ["```amy\nrestart\n```", "Nothing is waiting on you."];
    const desk = { conversation, harnesses: new Map([["claude", { name: "claude", ask: async () => ({ text: answers.shift()!, run: { outcome: "completed" } as never }) }]]), cwd: home, directory: path.join(home, "chat"), commands: CHAT_COMMANDS, act };

    pending.push({ id: "1", at: "2026-11-09T10:00:00.000Z", author: "op", text: "/action restart", place: "chat" });
    const pass = await answerTheChat(desk);
    await Promise.all(pass.after.map((after) => after()));
    pending.push({ id: "2", at: "2026-11-09T10:01:00.000Z", author: "op", text: "anything waiting on me?", place: "chat" });
    await answerTheChat(desk);

    expect(exits).toEqual([]);
    expect(ran).toEqual([]);
    expect(fs.existsSync(path.join(home, "restart.json"))).toBe(false);
    expect(said.join("\n")).toMatch(/restart: refused — no supervisor would start the new loop \(systemd --user is not working here: Failed to connect to bus: No medium found\)\. This loop and the chat stay as they are, pid 4242\./);
    expect(said.at(-1)).toBe("Nothing is waiting on you.");
    fs.rmSync(home, { recursive: true, force: true });
  });
});

/**
 * Against the machine's own supervisor: launchd on macOS, systemd --user on
 * Linux, Task Scheduler on Windows. It installs a loop and takes it away, so
 * it runs only where asked — CI runs it on all three (S41).
 */
const REAL = process.env.AMY_SUPERVISOR_TEST === "1";
const CLI = path.resolve(import.meta.dirname, "../dist/index.js");

describe.runIf(REAL)(`under this machine's own supervisor, ${process.platform} (A11)`, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-supervised-"));
  const env = { ...process.env, AMY_HOME: home } as Record<string, string>;
  delete env.AMY_SUPERVISOR;
  const amy = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf-8", timeout: 120_000 });
  // A workflow that is not there: the supervised loop waits for it rather than exiting.
  fs.writeFileSync(path.join(home, "config.yaml"), `workflows:\n  probe:\n    workflow: ${JSON.stringify(path.join(home, "not-yet"))}\ndefaultWorkflow: probe\n`);
  const config = loadConfig(home);
  const resolved = resolveProfile(config, "probe", home);
  if (!resolved.ok) throw new Error(resolved.problem);
  const pidFile = profilePaths(home, resolved.profile).pid;
  const recorded = () => {
    try {
      return (JSON.parse(fs.readFileSync(pidFile, "utf-8")) as { pid: number }).pid;
    } catch {
      return undefined;
    }
  };
  const alive = (pid: number | undefined) => {
    if (pid === undefined) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  };
  const until = async (what: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (what()) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return what();
  };

  afterAll(() => {
    amy("stop");
    // Windows keeps a file open a moment after the process holding it ends.
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  });

  it("starts the loop under it, names it in the doctor, and a loop killed hard runs again with a new pid", async () => {
    expect(fs.existsSync(CLI)).toBe(true);
    const started = amy("start", "--every", "1");
    expect(started.stderr).toBe("");
    const first = Number(/under (?:launchd|systemd|task-scheduler): pid (\d+)/.exec(started.stdout)?.[1]);
    expect(first).toBeGreaterThan(0);
    expect(alive(first)).toBe(true);

    const doctor = amy("doctor");
    expect(doctor.stdout).toMatch(/ok {3}supervisor {2}(launchd|systemd --user|Task Scheduler)/);

    process.kill(first, "SIGKILL");
    // launchd throttles a respawn to 30s after the last; the Windows launcher pauses 5s.
    expect(await until(() => alive(recorded()) && recorded() !== first, 180_000)).toBe(true);
    expect(recorded()).not.toBe(first);
  }, 240_000);

  it("is not started again once stopped with amy stop, and nothing of it is left installed", async () => {
    const running = recorded();
    expect(alive(running)).toBe(true);

    const stopped = amy("stop");
    expect(stopped.stdout).toMatch(/stopped probe/);
    expect(await until(() => !alive(running), 30_000)).toBe(true);
    // Longer than either supervisor waits to restart a loop that died.
    await new Promise((resolve) => setTimeout(resolve, process.platform === "win32" ? 80_000 : 40_000));

    expect(alive(recorded())).toBe(false);
    const found = await findSupervisor({ platform: process.platform, runner: new NodeCommandRunner(), home: os.homedir(), user: os.userInfo().username, uid: process.getuid?.() ?? 0, env: process.env });
    expect(found.ok && await found.supervisor.installed(labelFor(home, "probe"))).toBe(false);
  }, 180_000);

  it.runIf(process.platform === "win32")("registers the Windows task with a logon trigger, launched by wscript, and leaves no Startup entry beside it (A16)", async () => {
    const started = amy("start", "--every", "1");
    expect(started.stdout).toMatch(/under task-scheduler/);
    const label = labelFor(home, "probe");
    const xml = spawnSync("schtasks", ["/Query", "/TN", `\\amy\\${label}`, "/XML"], { encoding: "utf-8" }).stdout;
    expect(xml).toMatch(/<LogonTrigger>/);
    expect(xml).toMatch(/<Command>wscript\.exe<\/Command>/);
    // Least privilege is the default, which Task Scheduler leaves out when it answers.
    expect(xml).not.toMatch(/HighestAvailable/);
    expect(xml).toMatch(/<RestartOnFailure>/);
    const startup = path.join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", `${label}.vbs`);
    expect(fs.existsSync(startup)).toBe(false);
    // No console: the loop's parent is wscript, not cmd.
    const pid = recorded()!;
    const parent = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId | ForEach-Object { (Get-Process -Id $_).ProcessName }`], { encoding: "utf-8" }).stdout.trim();
    expect(parent.toLowerCase()).toBe("wscript");
    amy("stop");
  }, 180_000);
});
