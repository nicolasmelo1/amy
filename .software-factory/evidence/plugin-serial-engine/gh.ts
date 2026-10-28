// The working forge stage 10 of the probe swaps in for the outage stand-in.
//
// Usage: tsx gh.ts <code-host-state> <gh argv...>
import fs from "node:fs";
import path from "node:path";

interface Pull {
  number: number;
  head: string | undefined;
  base: string | undefined;
  state: "open";
}

interface CodeHostState {
  nextNumber: number;
  repos: Record<string, Pull[]>;
}

const [stateFile, ...argv] = process.argv.slice(2);
if (stateFile === undefined) {
  console.error("usage: gh.ts <code-host-state> <gh argv...>");
  process.exit(2);
}
fs.appendFileSync(path.join(path.dirname(stateFile), "gh.argv.log"), JSON.stringify(argv) + "\n");
const fields = (args: string[]) => {
  const found: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "-f" && args[i] !== "-F") continue;
    const pair = args[i + 1] ?? "";
    const at = pair.indexOf("=");
    if (at > 0) found[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return found;
};
if (argv.includes("graphql")) {
  process.stdout.write('{"data":{"repository":{"pullRequests":{"nodes":[]}}}}\n');
  process.exit(0);
}
const route = argv.find((a) => a.startsWith("/repos/")) ?? "";
if (route.endsWith("/pulls") && argv.includes("POST")) {
  const repo = route.slice("/repos/".length, route.length - "/pulls".length);
  const given = fields(argv);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as CodeHostState;
  const pull: Pull = { number: state.nextNumber, head: given.head, base: given.base, state: "open" };
  state.nextNumber += 1;
  (state.repos[repo] ??= []).push(pull);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ number: pull.number }) + "\n");
  process.exit(0);
}
process.stdout.write("main\n");
process.exit(0);
