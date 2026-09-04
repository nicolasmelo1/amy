import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installedStamp } from "../src/stamp.js";

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-stamp-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/** A URL for the scratch directory, as the caller would pass one. */
const where = (): URL => pathToFileURL(`${directory}${path.sep}`);

const write = (value: unknown): void => {
  fs.writeFileSync(path.join(directory, "stamp.json"), JSON.stringify(value), "utf-8");
};

describe("what an installed package says it is", () => {
  // The load-bearing case. A checkout has no stamp beside its code, and
  // reading the version out of package.json instead would make every working
  // tree claim to be a release.
  it("is a checkout when nothing was written beside the code", () => {
    expect(installedStamp(where())).toEqual({
      version: "dev",
      commit: "dev",
      builtAt: "",
      released: false,
    });
  });

  it("is a release when the pack wrote one", () => {
    write({ version: "0.2.0", commit: "abc1234", builtAt: "2026-09-04T21:00:00Z" });

    expect(installedStamp(where())).toEqual({
      version: "0.2.0",
      commit: "abc1234",
      builtAt: "2026-09-04T21:00:00Z",
      released: true,
    });
  });

  it("refuses to call itself a release on half a stamp", () => {
    write({ version: "0.2.0" });
    expect(installedStamp(where()).released).toBe(false);
  });

  // A stamp that will not parse is a build that cannot say what it is, and
  // there is already a name for that. Refusing to start over it would be
  // failing on a cosmetic detail.
  it("falls back to a checkout rather than failing on a broken stamp", () => {
    fs.writeFileSync(path.join(directory, "stamp.json"), "{not json", "utf-8");
    expect(installedStamp(where()).released).toBe(false);
  });
});
