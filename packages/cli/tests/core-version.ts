import fs from "node:fs";

/** The core this repository holds, so a fixture that depends on it follows every release. */
export const CORE_VERSION = (JSON.parse(fs.readFileSync(new URL("../../core/package.json", import.meta.url), "utf8")) as { version: string }).version;

/** The range a package asks for that core with. */
export const CORE_RANGE = `^${CORE_VERSION}`;
