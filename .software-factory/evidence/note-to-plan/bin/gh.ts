// The stand-in code host, as much of `gh` as this workflow calls: find the
// pull request on a branch, open one, and say what the default branch is.
//
// A CLI on the PATH rather than an injected object, so what is proved is the
// real argv the adapter builds and the real parsing of what comes back. Every
// invocation is logged, which is how the run can assert that no pull request
// was opened before the check went green — an ordering no return value shows.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** A pull request as this stand-in keeps it in `code-host.json`. */
interface Pull {
  number: number;
  title: string | undefined;
  body: string | undefined;
  head: string | undefined;
  base: string | undefined;
  state: string;
}

interface CodeHost {
  defaultBranch: string;
  nextNumber: number;
  refuse?: string[];
  decline?: string[];
  repos: Record<string, { pulls: Pull[] }>;
}

const world = process.env.AMY_E2E_WORLD;
if (!world) {
  process.stderr.write("AMY_E2E_WORLD names no world for this stand-in\n");
  process.exit(1);
}
const origins = process.env.AMY_E2E_ORIGINS ?? "";
const stateFile = path.join(world, "code-host.json");

const argv = process.argv.slice(2);
fs.appendFileSync(
  path.join(world, "gh.log"),
  `${JSON.stringify({ at: new Date().toISOString(), argv })}\n`,
);

if (argv[0] === "--version") {
  process.stdout.write("gh version 2.0.0 (stand-in)\n");
  process.exit(0);
}

const read = (): CodeHost => JSON.parse(fs.readFileSync(stateFile, "utf-8")) as CodeHost;
const write = (state: CodeHost): void => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");

/** `-f name=value` and `-F name=value`, as gh takes them. */
function fields(args: string[]): Record<string, string | undefined> {
  const found: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "-f" && args[index] !== "-F") continue;
    const pair = args[index + 1] ?? "";
    const split = pair.indexOf("=");
    found[pair.slice(0, split)] = pair.slice(split + 1);
  }
  return found;
}

/** The commit the branch actually points at, from the repository itself. */
function headOf(repo: string, branch: string | undefined): string {
  const gitDir = path.join(origins, `${repo.slice(repo.indexOf("/") + 1)}.git`);
  try {
    return execFileSync("git", ["--git-dir", gitDir, "rev-parse", `refs/heads/${branch}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const state = read();

if (argv.includes("graphql")) {
  const given = fields(argv);
  const repo = `${given.owner}/${given.name}`;
  const found = (state.repos[repo]?.pulls ?? []).find(
    (pull) => pull.head === given.branch && pull.state === "open",
  );

  process.stdout.write(
    `${JSON.stringify({
      data: {
        repository: {
          pullRequests: {
            nodes: found
              ? [
                  {
                    number: found.number,
                    isDraft: false,
                    reviewDecision: null,
                    headRefOid: headOf(repo, found.head),
                    reviewRequests: { nodes: [] },
                    reviews: { nodes: [] },
                    reviewThreads: { nodes: [] },
                  },
                ]
              : [],
          },
        },
      },
    })}\n`,
  );
  process.exit(0);
}

const route = argv.find((arg) => arg.startsWith("/repos/")) ?? "";

if (route.endsWith("/pulls") && argv.includes("POST")) {
  const repo = route.slice("/repos/".length, route.length - "/pulls".length);
  const given = fields(argv);

  // Where the code host is not answering. A tick that cannot finish is the
  // point of this one: it is what leaves a note behind.
  if ((state.refuse ?? []).includes(repo)) {
    fail(`gh: could not open a pull request in ${repo}`);
  }

  // Where the code host answers, and the answer is no: gh's own shape for a
  // 422, which is an answer the adapter hands back rather than an outage.
  if ((state.decline ?? []).includes(repo)) {
    fail("gh: Pull request creation is disabled for this repository (HTTP 422)");
  }

  const pull: Pull = {
    number: state.nextNumber,
    title: given.title,
    body: given.body,
    head: given.head,
    base: given.base,
    state: "open",
  };

  state.nextNumber += 1;
  (state.repos[repo] ??= { pulls: [] }).pulls.push(pull);
  write(state);

  process.stdout.write(`${JSON.stringify({ number: pull.number })}\n`);
  process.exit(0);
}

if (route.startsWith("/repos/")) {
  process.stdout.write(`${state.defaultBranch}\n`);
  process.exit(0);
}

fail(`the stand-in gh does not know \`${argv.join(" ")}\``);
