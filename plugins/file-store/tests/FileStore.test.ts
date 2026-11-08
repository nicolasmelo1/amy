import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileStore } from "../src/FileStore.js";

describe("FileStore", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-store-"));

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("reads an absent store without creating it", () => {
    const records = path.join(root, "records");

    expect(new FileStore(records, false).all()).toEqual([]);
    expect(fs.existsSync(records)).toBe(false);
  });
});
