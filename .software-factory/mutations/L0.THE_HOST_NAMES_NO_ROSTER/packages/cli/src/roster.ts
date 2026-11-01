// The smallest violation there is: the host writes, types and checks the
// file's old home on every install, in the CLI that mounted nothing.
import fs from "node:fs";
import path from "node:path";

const ROOT_ROSTER = path.join("~/.amy", "roster.yaml");

export function loadRoster(home: string): unknown {
  const file = path.join(home, "roster.yaml");
  return YAML.parse(fs.readFileSync(file, "utf-8"));
}