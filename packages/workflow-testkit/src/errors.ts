import { Finding, PROPERTIES, Property } from "./finding.js";

/** Thrown by one property's test, carrying every finding under it. */
export class ConformanceError extends Error {
  constructor(
    readonly property: Property,
    readonly findings: readonly Finding[],
  ) {
    super([`${PROPERTIES[property]}, and it did not:`, ...findings.map((f) => `  - ${f.message}`)].join("\n"));
    this.name = "ConformanceError";
  }
}
