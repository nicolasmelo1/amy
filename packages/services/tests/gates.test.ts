import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repository = path.resolve(import.meta.dirname, "../../..");
const tsx = path.join(repository, "node_modules/.bin/tsx");
const example = path.join(import.meta.dirname, "example");
const fixture = (rule: string): string => path.join(repository, ".software-factory/mutations", rule);
const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function gate(name: string, tree: string, ...args: string[]): { status: number | null; said: string } {
  const run = spawnSync(tsx, [path.join(repository, "packages/services/gates", `${name}.ts`), ...args], { cwd: tree, encoding: "utf8" });
  return { status: run.status, said: `${run.stdout}${run.stderr}` };
}

describe("the services' gates", { timeout: 60_000 }, () => {
  it.each(["keep-their-domains", "keep-no-database", "documents-itself", "every-error-tested"])("%s passes the example domain and the repository", (name) => {
    expect(gate(name, example)).toMatchObject({ status: 0 });
    expect(gate(name, repository)).toMatchObject({ status: 0 });
  });

  it("refuses an operation file exporting its schema, a domain reading another, a port outside a repository and a transport", () => {
    const { status, said } = gate("keep-their-domains", fixture("L0.THE_SERVICES_KEEP_THEIR_DOMAINS"));
    expect(status).toBe(1);
    expect(said).toContain("operations/read-note.ts exports `output`");
    expect(said).toContain("from domain `notes`: domain `tags` reads no other domain");
    expect(said).toContain("imports the port `Store`: only a repository reaches a port");
    expect(said).toContain("src/serve.ts imports `hono`");
    expect(said).toContain("domain `tags` has no exceptions.ts");
  });

  it("refuses a driver, the filesystem outside a repository, a file adapter by name and an un-awaited port call", () => {
    const { status, said } = gate("keep-no-database", fixture("L0.THE_SERVICES_KEEP_NO_DATABASE"));
    expect(status).toBe(1);
    expect(said).toContain("imports `better-sqlite3`");
    expect(said).toContain("services/read-note.ts imports `node:fs`");
    expect(said).toContain("names a file adapter (`@amykit/plugin-file-store`)");
    expect(said).toContain("calls `this.store.load` without awaiting it");
  });

  it("refuses an operation and a property without a description, naming both", () => {
    const { status, said } = gate("documents-itself", fixture("L4.THE_CONTRACT_DOCUMENTS_ITSELF"));
    expect(status).toBe(1);
    expect(said).toContain("`notes.read-note` has no description");
    expect(said).toContain("output property `text` has no description");
    expect(said).toContain("has no example of its input and its output");
  });

  it("refuses a declared error no test produced, naming the operation and the code", () => {
    const { status, said } = gate("every-error-tested", fixture("L3.EVERY_DECLARED_ERROR_IS_TESTED"));
    expect(status).toBe(1);
    expect(said).toContain("`notes.read-note` declares `notes.not_found`, and no test produced it through invoke");
  });

  it("refuses an output field removed without raising the major, and lets it through once the major is raised", () => {
    const broken = fixture("L2.THE_CONTRACT_ONLY_BREAKS_ON_PURPOSE");
    const refused = gate("breaks-on-purpose", broken, "--base", "packages/services/openapi.base.json");
    expect(refused.status).toBe(1);
    expect(refused.said).toContain("removed the required property `text`");

    const raised = fs.mkdtempSync(path.join(os.tmpdir(), "amy-raised-"));
    made.push(raised);
    fs.cpSync(path.join(broken, "packages"), path.join(raised, "packages"), { recursive: true });
    const head = path.join(raised, "packages/services/openapi.json");
    const document = JSON.parse(fs.readFileSync(head, "utf8")) as { info: { version: string } };
    document.info.version = "2.0.0";
    fs.writeFileSync(head, JSON.stringify(document));
    expect(gate("breaks-on-purpose", raised, "--base", "packages/services/openapi.base.json")).toMatchObject({ status: 0 });
  });
});
