import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileStopSwitch } from "../src/FileStopSwitch.js";

describe("FileStopSwitch", () => {
  let root: string;
  let file: string;
  let stop: FileStopSwitch;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-stop-"));
    file = path.join(root, "STOP");
    stop = new FileStopSwitch(file);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("is not requested until it is", () => {
    expect(stop.isRequested()).toBe(false);
    expect(stop.reason()).toBeNull();
  });

  it("remembers why", () => {
    stop.request("the gate keeps failing");

    expect(stop.isRequested()).toBe(true);
    expect(stop.reason()).toBe("the gate keeps failing");
  });

  it("says something even when nobody gave a reason", () => {
    stop.request("");

    expect(stop.reason()).toBe("no reason given");
  });

  it("releases", () => {
    stop.request("hold on");
    stop.clear();

    expect(stop.isRequested()).toBe(false);
  });

  it("does not mind being released twice", () => {
    expect(() => {
      stop.clear();
      stop.clear();
    }).not.toThrow();
  });

  it("is readable by another instance, which is how another process sees it", () => {
    stop.request("from over there");

    expect(new FileStopSwitch(file).isRequested()).toBe(true);
  });

  it("creates the directory it was pointed at", () => {
    const deep = new FileStopSwitch(path.join(root, "a", "b", "STOP"));

    deep.request("deep");

    expect(deep.isRequested()).toBe(true);
  });

  it("calls back straight away when a stop is already in force", () => {
    stop.request("already stopped");
    let heard: string | null = null;

    const unwatch = stop.watch((reason) => {
      heard = reason;
    });
    unwatch();

    expect(heard).toBe("already stopped");
  });

  it("calls back when the stop arrives while it is watching", async () => {
    const heard = new Promise<string>((resolve) => {
      const unwatch = stop.watch((reason) => {
        unwatch();
        resolve(reason);
      });
    });

    // Written after the watch is in place, which is the case that matters:
    // the run is already going when the operator pulls the brake.
    setTimeout(() => stop.request("pulled mid-run"), 20);

    await expect(heard).resolves.toBe("pulled mid-run");
  });
});
