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

  it("vendor hermes's CLI from the release the manifest names, as that binary reports itself", () => {
    // `hermes --version` prints `Hermes Agent vX.Y.Z (date)`; the tag vX.Y.Z is
    // the release. A help text that does not carry that line, or carries
    // another version, was not produced by the release it is pinned to.
    const entry = vendored(/hermes/)!;
    const body = fs.readFileSync(path.join(directory, entry.file), "utf8");
    const reported = /Hermes Agent v(\d+\.\d+\.\d+)/.exec(body)?.[1];

    expect(reported).toBeDefined();
    expect(entry.version?.replace(/^v/, "")).toBe(reported);
  });

  it("name the publisher's release each harness contract is derived from, so the check can compare against it", () => {
    const codex = vendored(/codex/) as (Entry & { url?: string }) | undefined;
    const hermes = vendored(/hermes/) as (Entry & { url?: string }) | undefined;

    expect(codex?.version).toBeDefined();
    expect(codex?.url).toMatch(/^https:\/\/github\.com\/openai\/codex\//);
    expect(codex?.url).toContain(String(codex?.version));
    expect(hermes?.version).toBeDefined();
    expect(hermes?.url).toMatch(/^https:\/\/github\.com\/NousResearch\/hermes-agent\//);
    expect(hermes?.url).toContain(String(hermes?.version).replace(/^v/, ""));
  });
});
