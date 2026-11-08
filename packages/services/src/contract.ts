import { contractDocument, defineContract, type Contract, type DeclaredOperation } from "@amykit/core";
import { operations } from "./domains/index.js";

/**
 * The contract's major. Raising it is the only way a breaking change to the
 * document gets past `the-contract-only-breaks-on-purpose`.
 */
export const API_MAJOR = 1;

const INFO = {
  title: "amy",
  version: `${API_MAJOR}.0.0`,
  description: "Every operation amy offers, at every door: the command line, the server, the SDK and a workflow.",
};

/** amy's own operations, before any plugin adds its own. */
export const services: Contract = defineContract(operations);

/** The OpenAPI document of a set of operations; amy's own when none are named. */
export function servicesDocument(declared: readonly DeclaredOperation[] = operations): Record<string, unknown> {
  return contractDocument(declared === operations ? services : defineContract(declared), INFO);
}
