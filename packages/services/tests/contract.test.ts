import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@hyperjump/json-schema/openapi-3-1";
import { describe, expect, it } from "vitest";
import { API_MAJOR, services, servicesDocument } from "../src/index.js";
import { notes } from "./example/packages/services/src/domains/notes/index.js";

const OPENAPI_31 = "https://spec.openapis.org/oas/3.1/schema-base";

describe("the services' contract", () => {
  it("builds a valid OpenAPI 3.1 document with no domain at all", async () => {
    const document = servicesDocument();
    expect(services.operations.size).toBe(0);
    expect(document.paths).toEqual({});
    expect((await validate(OPENAPI_31, document as never)).valid).toBe(true);
  });

  it("gains exactly one example domain's operations when it is added", async () => {
    const document = servicesDocument(notes) as { paths: Record<string, Record<string, { operationId: string }>> };
    const ids = Object.values(document.paths).flatMap((methods) => Object.values(methods).map((one) => one.operationId));
    expect(ids).toEqual(notes.map((one) => one.id));
    expect((await validate(OPENAPI_31, document as never)).valid).toBe(true);
  });

  it("says its major in the document's version", () => {
    expect((servicesDocument().info as { version: string }).version).toBe(`${API_MAJOR}.0.0`);
  });

  it("matches the committed openapi.json, which npm run build writes", () => {
    const committed = JSON.parse(readFileSync(resolve(import.meta.dirname, "../openapi.json"), "utf8")) as unknown;
    expect(committed).toEqual(servicesDocument());
  });

  it("matches the example tree's document, which the gates' fixtures are copied from", () => {
    const committed = JSON.parse(readFileSync(resolve(import.meta.dirname, "example/packages/services/openapi.json"), "utf8")) as unknown;
    expect(committed).toEqual(servicesDocument(notes));
  });
});
