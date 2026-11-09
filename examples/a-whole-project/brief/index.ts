// The brief phase is the shipped feature-grooming workflow: the brief's
// Goal, Sources, Criteria and Out of scope, and the criteria it settles.
import { withDiagramBeside } from "@amykit/core";
import { plugin as grooming } from "@amykit/workflow-feature-grooming";

export const plugin = withDiagramBeside(grooming, import.meta.resolve("@amykit/workflow-feature-grooming"));
