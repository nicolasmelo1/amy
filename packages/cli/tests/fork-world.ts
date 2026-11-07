import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CommandResult, CommandRunner, NodeCommandRunner, RunOptions } from "@amykit/core";

/**
 * A repository a package's source lives in, on this disk: what a fork is
 * fetched from. Each release is a commit tagged `<name>@<version>`, the way
 * the published packages are.
 */
export class Upstream {
  readonly url: string;

  constructor(readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.git(["init", "-q", "-b", "main"]);
    this.git(["config", "user.email", "upstream@example.test"]);
    this.git(["config", "user.name", "upstream"]);
    this.git(["config", "commit.gpgsign", "false"]);
    this.git(["config", "tag.gpgsign", "false"]);
    this.url = `git+file://${directory}`;
  }

  /** Writes files (a null deletes one), commits them, and tags the commit when a tag is given. */
  release(files: Record<string, string | null>, tag?: string): string {
    for (const [file, content] of Object.entries(files)) {
      const to = path.join(this.directory, file);
      if (content === null) fs.rmSync(to, { force: true });
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, content);
      }
    }
    this.git(["add", "-A"]);
    this.git(["commit", "-q", "--allow-empty", "-m", tag ?? "change"]);
    if (tag) this.git(["tag", tag]);
    return this.git(["rev-parse", "HEAD"]).trim();
  }

  private git(args: readonly string[]): string {
    return execFileSync("git", args, { cwd: this.directory, encoding: "utf-8" });
  }
}

/** One call this runner was asked to make, as it was asked. */
export interface Call {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

/**
 * The machine as far as a fork asks it: git is the real one, against the
 * repositories above; npm is a stand-in that installs a root's `file:`
 * dependencies the way `--install-links` does — a copy without its
 * `node_modules` — runs a package's build script, and answers `view` from a
 * table. Every call is kept, so a test can say which were never made.
 */
export class ForkWorld implements CommandRunner {
  readonly calls: Call[] = [];
  private readonly git = new NodeCommandRunner();

  constructor(private readonly registry: Record<string, unknown> = {}) {}

  async run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    this.calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === "git") return this.git.run(command, args, options);
    if (command !== "npm") return failed(`${command} is not on this machine`);
    const [verb, ...rest] = args;
    if (verb === "view") {
      const known = this.registry[rest[0]!];
      return known ? ok(JSON.stringify(known)) : failed(`npm error 404 '${rest[0]}' is not in this registry`);
    }
    if (verb === "install" && rest[0] === "--prefix") return this.installRoot(rest[1]!);
    if (verb === "install") return ok("");
    if (verb === "run" && rest[0] === "build") return this.build(options.cwd!);
    return failed(`npm ${verb} is not part of this world`);
  }

  /** Whether npm was asked anything at all. */
  askedNpm(): boolean {
    return this.calls.some((call) => call.command === "npm");
  }

  private installRoot(root: string): CommandResult {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as { dependencies?: Record<string, string> };
    for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (!spec.startsWith("file:")) return failed(`${name}@${spec} is not on this disk`);
      const to = path.join(root, "node_modules", ...name.split("/"));
      fs.rmSync(to, { recursive: true, force: true });
      const from = path.resolve(root, spec.slice("file:".length));
      fs.cpSync(from, to, {
        recursive: true,
        filter: (file) => !path.relative(from, file).split(path.sep).includes("node_modules"),
      });
    }
    return ok("");
  }

  private build(cwd: string): CommandResult {
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8")) as { scripts?: Record<string, string> };
    try {
      return ok(execFileSync("sh", ["-c", manifest.scripts!.build!], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }));
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      return failed(`${failure.stdout ?? ""}${failure.stderr ?? ""}`);
    }
  }
}

function ok(stdout: string): CommandResult {
  return { ok: true, exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string): CommandResult {
  return { ok: false, exitCode: 1, stdout: "", stderr };
}

/** A package in the machine's root, as npm would have put it there. */
export function installed(pluginsRoot: string, manifest: { name: string } & Record<string, unknown>, files: Record<string, string>): string {
  const directory = path.join(pluginsRoot, "node_modules", ...manifest.name.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest, null, 2));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), content);
  }
  if (!fs.existsSync(path.join(pluginsRoot, "package.json"))) fs.writeFileSync(path.join(pluginsRoot, "package.json"), JSON.stringify({ name: "amy-plugins", private: true }));
  return directory;
}
