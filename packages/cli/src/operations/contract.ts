import { services, servicesDocument } from "@amykit/services";
import type { DeclaredOperation } from "@amykit/core";
import type { Contribution } from "../plugin-commands.js";

/**
 * The install's whole contract as an OpenAPI document: amy's own services,
 * and every operation a plugin some profile mounts declares. A plugin's
 * operation is local-only unless it says otherwise, so installing one never
 * opens a route over TCP by surprise.
 *
 * Throws, naming what clashed, when the operations do not make one contract:
 * an id declared twice, or two operations taking one path and method.
 */
export function installContract(contributions: readonly Contribution[]): Record<string, unknown> {
  const own: DeclaredOperation[] = [...services.operations.values()];
  const brought = contributions.flatMap((contribution) => contribution.operations);
  return servicesDocument([...own, ...brought]);
}
