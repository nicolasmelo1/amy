import fs from "node:fs";
import path from "node:path";
import type { LoopSpec, MachineFacts, Supervisor } from "./index.js";

/**
 * macOS: a launchd agent (S32). It runs at load, so at login too; it is kept
 * alive only when it did not exit successfully, so a crash or a kill brings
 * it back and `amy stop`'s clean exit does not; and it is throttled, so a
 * loop that dies at once is not spun.
 */
export function launchd(machine: MachineFacts): Supervisor & { domain(): Promise<string> } {
  const agents = path.join(machine.home, "Library", "LaunchAgents");
  const plist = (label: string) => path.join(agents, `${label}.plist`);
  let domain: string | undefined;

  /** The person's GUI session where there is one, their background session where there is not (over ssh). */
  const target = async (): Promise<string> => {
    if (domain) return domain;
    const gui = `gui/${machine.uid}`;
    domain = (await machine.runner.run("launchctl", ["print", gui])).ok ? gui : `user/${machine.uid}`;
    return domain;
  };

  return {
    name: "launchd",
    domain: target,
    async start(spec: LoopSpec) {
      fs.mkdirSync(agents, { recursive: true });
      fs.writeFileSync(plist(spec.label), plistOf(spec), { mode: 0o644 });
      const where = await target();
      // A loop left loaded from before is replaced, not refused.
      await machine.runner.run("launchctl", ["bootout", `${where}/${spec.label}`]);
      const loaded = await machine.runner.run("launchctl", ["bootstrap", where, plist(spec.label)]);
      if (!loaded.ok) throw new Error(`launchctl bootstrap ${where} refused ${spec.label}: ${loaded.stderr || loaded.stdout}`);
    },
    async stop(label: string) {
      // The plist first: bootout may end the very process stopping it (a stop
      // asked from the chat runs in the job), and a plist left behind would
      // start the loop again at the next login.
      fs.rmSync(plist(label), { force: true });
      await machine.runner.run("launchctl", ["bootout", `${await target()}/${label}`]);
    },
    async installed(label: string) {
      return fs.existsSync(plist(label));
    },
  };
}

/** The agent's property list, every value escaped. */
export function plistOf(spec: LoopSpec): string {
  const string = (value: string) => `<string>${escapeXml(value)}</string>`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>${string(spec.label)}`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...[spec.program, ...spec.args].map((arg) => `    ${string(arg)}`),
    `  </array>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    ...Object.entries(spec.env).map(([key, value]) => `    <key>${escapeXml(key)}</key>${string(value)}`),
    `  </dict>`,
    `  <key>WorkingDirectory</key>${string(spec.workingDirectory)}`,
    `  <key>RunAtLoad</key><true/>`,
    `  <key>KeepAlive</key>`,
    `  <dict>`,
    `    <key>SuccessfulExit</key><false/>`,
    `  </dict>`,
    `  <key>ThrottleInterval</key><integer>30</integer>`,
    `  <key>ProcessType</key>${string("Background")}`,
    `</dict>`,
    `</plist>`,
    ``,
  ].join("\n");
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
