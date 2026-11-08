import { defineContract } from "@amykit/core";
import { notes } from "./domains/notes/index.js";

/** The example tree's own services, as packages/services/src/index.ts exports amy's. */
export const services = defineContract(notes);
