import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The gate's claims name the product: the Telegram bot, `amy look`, and the
 * Slack and Linear calls. Each claim drives that product, not the core piece
 * underneath it, or the gate proves the piece and says it proved the product.
 */
const drive = fs.readFileSync(path.join(process.cwd(), ".software-factory/evidence/nothing-is-lost/drive.ts"), "utf-8");

describe("the nothing-is-lost gate", () => {
  it("holds the bot through the Telegram plugin's own build", () => {
    expect(drive).toMatch(/plugins\/telegram\/dist\//);
  });

  it("releases a record with the installed `amy look`", () => {
    expect(drive).toMatch(/\[\s*["']look["']/);
  });

  it("checks the release a look made is still there after the engine's save", () => {
    expect(drive).toMatch(/\.gaveUp\b[^\n]*[!=]==?\s*undefined|["']gaveUp["']\s+in\s/);
  });

  it("ends a stalled call made through the Slack and Linear plugins' own builds", () => {
    expect(drive).toMatch(/plugins\/slack\/dist\//);
    expect(drive).toMatch(/plugins\/linear\/dist\//);
  });
});
