/**
 * A name as one path segment: escaped, its dots too, so a scenario, a step,
 * a unit or a resource named `..` stays a file in its own directory rather
 * than reaching the one above it.
 */
export function segment(name: string): string {
  return encodeURIComponent(name).replace(/\./g, "%2E");
}
