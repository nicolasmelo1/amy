import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { amyHome } from "../src/home.js";
import { paths } from "../src/paths.js";

describe("the paths one amy owns", () => {
  it("keeps plugins under the state directory", () => {
    const home = path.join(os.tmpdir(), "amy-paths-home");

    expect(paths(home).plugins).toBe(path.join(home, "plugins"));
  });

  it("moves the plugin root when AMY_HOME moves", () => {
    const configured = path.join(os.tmpdir(), "amy-other-home");
    const home = amyHome({ AMY_HOME: configured });

    expect(paths(home).plugins).toBe(path.join(configured, "plugins"));
  });
});