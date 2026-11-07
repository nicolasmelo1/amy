// Writes the example tree's openapi.json, the way `npm run build` writes the
// real one. Run by hand when the example domain changes; the contract test
// refuses one that has drifted from the domain.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { servicesDocument } from "../../src/contract.js";
import { notes } from "./packages/services/src/domains/notes/index.js";

writeFileSync(resolve(import.meta.dirname, "packages/services/openapi.json"), `${JSON.stringify(servicesDocument(notes), null, 2)}\n`);
