// The proving phase is the proving plugin's one workflow: it walks the
// scenario the brief settled, here a browser scenario, through the
// operations the mounted drivers offer.
import { withDiagramBeside } from "@amykit/core";
import { plugin as prove } from "@amykit/plugin-prove";

export const plugin = withDiagramBeside(prove, import.meta.resolve("@amykit/plugin-prove"));
