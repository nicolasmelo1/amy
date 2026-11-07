import type { DeclaredOperation } from "@amykit/core";

/**
 * Every domain's operations, one spread per domain folder: `...work` for
 * `./work/index.js`. Nothing else is listed here, so a domain reaches every
 * door by being added once.
 */
export const operations: readonly DeclaredOperation[] = [];
