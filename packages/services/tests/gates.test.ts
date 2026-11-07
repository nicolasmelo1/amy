import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
    expect(said).toContain("src/listen.mts imports `node:http`");
    expect(said).toContain("domain `tags` has no exceptions.ts");
    expect(said).toContain("reaches the port `Queue` through a namespace");
    expect(said).toContain("loads @amykit/core dynamically");
  });

  it("refuses a driver, the filesystem outside a repository, a file adapter by name and an un-awaited port call", () => {
    const { status, said } = gate("keep-no-database", fixture("L0.THE_SERVICES_KEEP_NO_DATABASE"));
    expect(status).toBe(1);
    expect(said).toContain("imports `better-sqlite3`");
    expect(said).toContain("services/read-note.ts imports `node:fs`");
    expect(said).toContain("names a file adapter (`@amykit/plugin-file-store`)");
    expect(said).toContain("calls `this.store.load` without awaiting it");
    expect(said).toContain("aliased.ts:8 calls `this.held.save` without awaiting it");
    expect(said).toContain("aliased.ts:13 calls `local.save` without awaiting it");
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

  it("reads the base from the merge-base with main when no base is named, and refuses the break there", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-merge-base-"));
    made.push(tree);
    const git = (...args: string[]): string => execFileSync("git", ["-c", "user.name=amy", "-c", "user.email=amy@example.test", ...args], { cwd: tree, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "work");
    const head = path.join(tree, "packages/services/openapi.json");
    const document = JSON.parse(fs.readFileSync(head, "utf8")) as { paths: Record<string, Record<string, any>> };
    const answer = document.paths["/notes/{id}"]?.get?.responses["200"].content["application/json"].schema;
    delete answer.properties.text;
    answer.required = ["id"];
    fs.writeFileSync(head, JSON.stringify(document));
    git("commit", "-qam", "drop text");
    const { status, said } = gate("breaks-on-purpose", tree);
    expect(status).toBe(1);
    expect(said).toContain("removed the required property `text`");
  });

  it("credits no declared error to a test that invoked another contract reusing the operation's id", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-borrowed-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    fs.symlinkSync(path.join(repository, "node_modules"), path.join(tree, "node_modules"));
    fs.writeFileSync(path.join(tree, "packages/services/tests/notes.test.ts"), [
      'import { defineContract, type OperationContext } from "@amykit/core";',
      'import { expect, it } from "vitest";',
      'import { readNote } from "../src/domains/notes/operations/read-note.js";',
      'import { invoke } from "./support/invoke.js";',
      "",
      "// A copy of the operation under the same id: not the one the document declares.",
      "const borrowed = defineContract([{ ...readNote }]);",
      "const empty: OperationContext = { port: () => ({ load: () => null, save: () => undefined, all: () => [] }) };",
      "",
      'it("answers not_found from a copy", async () => {',
      '  expect(await invoke(borrowed, "notes.read-note", { id: "gone" }, empty)).toMatchObject({ kind: "error" });',
      "});",
      "",
    ].join("\n"));
    const { status, said } = gate("every-error-tested", tree);
    expect(status).toBe(1);
    expect(said).toContain("`notes.read-note` declares `notes.not_found`, and no test produced it through invoke");
  });

  it("refuses an undescribed property inside a schema's $defs", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-defs-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    const file = path.join(tree, "packages/services/openapi.json");
    const document = JSON.parse(fs.readFileSync(file, "utf8")) as { paths: Record<string, Record<string, any>> };
    const answer = document.paths["/notes/{id}"]?.get?.responses["200"].content["application/json"].schema;
    answer.$id = "urn:amy:operation:notes.read-note/output";
    answer.$defs = { Node: { type: "object", properties: { name: { type: "string" } } } };
    answer.properties.child = { $ref: "#/$defs/Node", description: "a node" };
    fs.writeFileSync(file, JSON.stringify(document));
    const { status, said } = gate("documents-itself", tree);
    expect(status).toBe(1);
    expect(said).toContain("output.$defs.Node property `name` has no description");
  });

  it("lets a service name a plain value the ports declare, which is data rather than a port", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-view-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    const service = path.join(tree, "packages/services/src/domains/notes/services/read-note.ts");
    fs.writeFileSync(service, `import type { BriefView } from "@amykit/core";\n${fs.readFileSync(service, "utf8")}\nexport type Shown = BriefView;\n`);
    expect(gate("keep-their-domains", tree)).toMatchObject({ status: 0 });
  });

  it.each(["Tracker", "GroomingTracker"])("refuses a service naming %s, a port the core declares as an alias over ports", (port) => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-alias-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    const service = path.join(tree, "packages/services/src/domains/notes/services/read-note.ts");
    fs.writeFileSync(service, `import type { ${port} } from "@amykit/core";\n${fs.readFileSync(service, "utf8")}\nexport type Held = ${port};\n`);
    const { status, said } = gate("keep-their-domains", tree);
    expect(status).toBe(1);
    expect(said).toContain(`imports the port \`${port}\`: only a repository reaches a port`);
  });

  it("refuses an undescribed property inside a tuple's prefixItems", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-tuple-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    const file = path.join(tree, "packages/services/openapi.json");
    const document = JSON.parse(fs.readFileSync(file, "utf8")) as { paths: Record<string, Record<string, any>> };
    const answer = document.paths["/notes/{id}"]?.get?.responses["200"].content["application/json"].schema;
    answer.properties.pair = { type: "array", description: "a pair", prefixItems: [{ type: "object", properties: { left: { type: "string" } } }] };
    fs.writeFileSync(file, JSON.stringify(document));
    const { status, said } = gate("documents-itself", tree);
    expect(status).toBe(1);
    expect(said).toContain("output.pair property `left` has no description");
  });

  it("lets the domains' own index register a domain, being in no domain itself", () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "amy-barrel-"));
    made.push(tree);
    fs.cpSync(path.join(example, "packages"), path.join(tree, "packages"), { recursive: true });
    fs.writeFileSync(
      path.join(tree, "packages/services/src/domains/index.ts"),
      'import type { DeclaredOperation } from "@amykit/core";\nimport { notes } from "./notes/index.js";\n\nexport const operations: readonly DeclaredOperation[] = [...notes];\n',
    );
    expect(gate("keep-their-domains", tree)).toMatchObject({ status: 0 });
  });
});
