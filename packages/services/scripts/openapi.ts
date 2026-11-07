// Writes packages/services/openapi.json from the contract, which `npm run
// build` runs. The file is locked: edited by hand, L2.GENERATED_FILES_ARE_LOCKED
// refuses it, and the contract test refuses one that has drifted from the code.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { servicesDocument } from "../src/contract.js";

const target = resolve(import.meta.dirname, "../openapi.json");
writeFileSync(target, `${JSON.stringify(servicesDocument(), null, 2)}\n`);
