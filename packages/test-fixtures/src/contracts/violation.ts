import { fileURLToPath } from "node:url";

/**
 * A double was asked something its real counterpart would refuse, or
 * scripted to answer something its real counterpart could never send.
 *
 * Thrown rather than returned as a failed call: a test that meets one is a
 * test proving the code against a world that does not exist, and the only
 * honest outcome is that it goes red naming the contract.
 */
export class ContractViolation extends Error {
  constructor(
    readonly contract: string,
    detail: string,
  ) {
    super(`${contract} contract: ${detail}`);
    this.name = "ContractViolation";
  }
}

/**
 * Where the vendored contracts live: beside `src/` and `dist/` alike, so the
 * same relative path answers from source and from a build.
 */
export function contractFile(name: string): string {
  return fileURLToPath(new URL(`../../contracts/${name}`, import.meta.url));
}
