import { describe, it, expect } from "vitest";
import { describeBuild, stampFrom, stampId } from "../src/build.js";

const RELEASE = { version: "0.3.1", commit: "83ef192", builtAt: "2026-09-03T20:23:19Z" };

describe("what a build says about itself", () => {
  it("is a release when it knows its version and its commit", () => {
    expect(stampFrom(RELEASE)).toEqual({ ...RELEASE, released: true });
  });

  it("is a checkout when nothing was defined at compile time", () => {
    // Running from source under node leaves the defines undefined, which is
    // exactly how a dev run is told apart from a build.
    expect(stampFrom({})).toEqual({ version: "dev", commit: "dev", builtAt: "", released: false });
  });

  it("refuses to call itself a release on half a stamp", () => {
    // A binary claiming to be a release while unable to say which one is
    // worse than one admitting it is a checkout: the log line would look
    // joinable and would not be.
    expect(stampFrom({ version: "0.3.1" }).released).toBe(false);
    expect(stampFrom({ commit: "83ef192" }).released).toBe(false);
  });

  it("survives a build with no timestamp", () => {
    expect(stampFrom({ version: "0.3.1", commit: "83ef192" })).toMatchObject({
      released: true,
      builtAt: "",
    });
  });
});

describe("the id that goes on a log line", () => {
  it("joins version and commit, so two builds never collide", () => {
    expect(stampId(stampFrom(RELEASE))).toBe("0.3.1+83ef192");
  });

  it("is just `dev` from a checkout, because there is nothing to join to", () => {
    expect(stampId(stampFrom({}))).toBe("dev");
  });

  it("carries a dirty marker through, since the commit alone would be a lie", () => {
    const dirty = { ...RELEASE, commit: "83ef192-dirty" };

    expect(stampId(stampFrom(dirty))).toBe("0.3.1+83ef192-dirty");
  });
});

describe("what a person reads", () => {
  it("says version, commit and when", () => {
    expect(describeBuild(stampFrom(RELEASE))).toBe(
      "0.3.1 (83ef192, built 2026-09-03T20:23:19Z)",
    );
  });

  it("says plainly that a checkout is not an installed build", () => {
    expect(describeBuild(stampFrom({}))).toContain("not an installed build");
  });
});
