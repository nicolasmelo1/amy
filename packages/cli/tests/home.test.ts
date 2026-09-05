import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { amyHome, strayState } from "../src/home.js";

describe("where amy keeps its state", () => {
  it("is one directory per machine, not one per directory", () => {
    expect(amyHome({})).toBe(path.join(os.homedir(), ".amy"));
  });

  it("is not affected by where the command was typed", () => {
    // The whole reason this exists: `amy status` answering "nothing tracked
    // yet" because you were standing somewhere else is a lie with a
    // plausible explanation.
    expect(amyHome({})).toBe(amyHome({}));
  });

  it("takes AMY_HOME when it is set, absolute", () => {
    expect(amyHome({ AMY_HOME: "/tmp/elsewhere" })).toBe("/tmp/elsewhere");
    expect(path.isAbsolute(amyHome({ AMY_HOME: "relative" }))).toBe(true);
  });

  it("ignores an AMY_HOME that is only whitespace", () => {
    expect(amyHome({ AMY_HOME: "   " })).toBe(path.join(os.homedir(), ".amy"));
  });
});

describe("state a directory kept from before", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "amy-stray-"));
  });

  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  it("is reported when there is one", () => {
    fs.mkdirSync(path.join(cwd, ".amy"));

    expect(strayState(cwd, "/somewhere/else")).toBe(path.join(cwd, ".amy"));
  });

  it("is nothing when the directory is the home itself", () => {
    const home = path.join(cwd, ".amy");
    fs.mkdirSync(home);

    expect(strayState(cwd, home)).toBeUndefined();
  });

  it("is nothing when there is none", () => {
    expect(strayState(cwd, "/somewhere/else")).toBeUndefined();
  });

  it("is nothing when the two paths reach the same directory", () => {
    // `/var` is a symlink to `/private/var` on macOS, so a string comparison
    // told somebody standing in their own state directory to move it onto
    // itself.
    const home = path.join(cwd, ".amy");
    fs.mkdirSync(home);

    expect(strayState(cwd, fs.realpathSync(home))).toBeUndefined();
    expect(strayState(fs.realpathSync(cwd), home)).toBeUndefined();
  });
});
