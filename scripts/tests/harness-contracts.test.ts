import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The harness CLIs amy drives are held to their publishers' own contracts,
 * vendored and kept fresh by scripts/contracts.ts like Slack's, Telegram's and
 * gh's, so a stand-in cannot drift from the CLI it stands in for.
 *
 * Codex publishes its app-server protocol from the release binary itself
 * (`codex app-server generate-json-schema --out DIR`, codex-cli 0.166.0).
 * Hermes Agent publishes no schema; its CLI's own help for the commands amy
 * runs (`hermes --help`, `hermes profile create --help`, `hermes config
 * --help`) is the contract, as `gh reference` is for gh.
 */
const directory = path.resolve(import.meta.dirname, "../../packages/test-fixtures/contracts");

interface Entry {
  name: string;
  file: string;
  version?: string;
  sha256: string;
}

function entries(): Entry[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")) as Record<string, unknown>;
  return Object.values(manifest)
    .filter(Array.isArray)
    .flat()
    .filter((entry): entry is Entry => typeof entry === "object" && entry !== null && "file" in entry && "name" in entry);
}

function vendored(pattern: RegExp): Entry | undefined {
  return entries().find((entry) => pattern.test(entry.name));
}

function matches(entry: Entry): boolean {
  const body = fs.readFileSync(path.join(directory, entry.file));
  return createHash("sha256").update(body).digest("hex") === entry.sha256;
}

describe("the harness contracts", () => {
  it("vendor codex's app-server protocol, pinned to the release it came from", () => {
    const entry = vendored(/codex/);

    expect(entry?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(entry && matches(entry)).toBe(true);
  });

  it("vendor hermes's CLI, pinned to the release it came from", () => {
    const entry = vendored(/hermes/);

    expect(entry?.version).toMatch(/^v?\d+\.\d+\.\d+/);
    expect(entry && matches(entry)).toBe(true);
  });
});
