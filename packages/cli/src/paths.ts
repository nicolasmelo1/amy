import path from "node:path";

const AMY_DIR = ".amy";

export function paths(root: string) {
  const base = path.join(root, AMY_DIR);
  return {
    base,
    config: path.join(base, "config.yaml"),
    roster: path.join(base, "roster.yaml"),
    tickets: path.join(base, "tickets"),
    queue: path.join(base, "queue"),
    needsInput: path.join(base, "needs-input"),
    log: path.join(base, "log"),
    stop: path.join(base, "STOP"),
  };
}
