import { sameJson, type Intent } from "@amykit/ui";
import { buildKeymap, keysFor, type ConformanceRenderer, type Frame, type KeyOverrides, type Session, type Size } from "@amykit/ui/frame";
import { audit } from "./audit.js";
import { ASSERTIONS, checkStep, type Assertion, type Finding } from "./checks.js";
import { firstDifference, project, type Projection } from "./projection.js";
import { RUNS, SCRIPT, type Move, type Run, type Step } from "./script.js";
import { apply, scene, START, type ConformanceConfig, type WindowState } from "./world.js";

/** The conformance config: what the world's config gives, and the keymap the remapped run uses. */
export interface Conformance extends ConformanceConfig {
  readonly keys: KeyOverrides;
}

export interface Golden {
  readonly steps: readonly Projection[];
}

export interface Report {
  readonly renderers: readonly { readonly name: string; readonly unit: string; readonly surfaces: readonly string[] }[];
  readonly assertions: readonly { readonly type: Assertion; readonly status: "passed" | "failed"; readonly findings: number }[];
  readonly findings: readonly Finding[];
  /** Each renderer's projections, driven by the default keys. */
  readonly projections: Readonly<Record<string, readonly Projection[]>>;
}

interface Driven {
  readonly projections: readonly Projection[];
  readonly findings: readonly Finding[];
}

interface Drive {
  readonly frame: Frame;
  readonly renderer: ConformanceRenderer;
  readonly run: Run;
  readonly config: Conformance;
}

/** What the frame says one move should make the renderer ask for. */
function perform(drive: Drive, session: Session, move: Move, state: WindowState, keymap: ReturnType<typeof buildKeymap>): { got: readonly Intent[]; want: Intent; did: string } {
  const gesture = drive.run === "mouse" ? move.mouse : undefined;
  if (gesture !== undefined) {
    const action = drive.frame.mouse[gesture.gesture]?.[gesture.on] ?? "(no action)";
    return { got: session.pointer(gesture), want: { action, args: gesture.args }, did: `${gesture.gesture} on ${gesture.on}` };
  }
  const keys = keysFor(keymap, state.mode, move.action);
  if (keys === undefined) return { got: [], want: { action: move.action, args: {} }, did: `no key for ${move.action} in ${state.mode} mode` };
  return { got: keys.flatMap((key) => session.press(key)), want: { action: move.action, args: {} }, did: `${keys.join("")} in ${state.mode} mode` };
}

const describe = (intents: readonly Intent[]): string => (intents.length === 0 ? "nothing" : intents.map((intent) => intent.action).join(", "));

/** Whether what the renderer asked for is exactly the one intent the frame says this move asks for. */
const asked = (got: readonly Intent[], want: Intent): boolean => got.length === 1 && got[0]?.action === want.action && sameJson(got[0].args, want.args);

/** Where the last step takes the window: the narrowest the frame allows, in the renderer's unit. */
const narrowestFor = (frame: Frame, renderer: ConformanceRenderer, step: Step): Size | undefined =>
  step.narrowest ? (renderer.unit === "px" ? frame.narrowest.px : frame.narrowest.cells) : undefined;

/** The script once, through one renderer, one way: a projection per step and whatever each step broke. */
function driveOnce(drive: Drive): Driven {
  const { frame, renderer, run, config } = drive;
  const overrides = run === "remapped keys" ? config.keys : undefined;
  const keymap = buildKeymap(frame, overrides);
  const session = renderer.start({ frame, ...(overrides === undefined ? {} : { keys: overrides }) });
  let state = START;
  session.draw(scene(frame, state, config));
  const projections: Projection[] = [];
  const findings: Finding[] = [];
  for (const step of SCRIPT) {
    for (const move of step.moves) {
      const { got, want, did } = perform(drive, session, move, state, keymap);
      if (!asked(got, want)) {
        findings.push({ assertion: "frame.every_key_does_what_it_is_declared_to", renderer: renderer.name, run, step: step.name, message: `${did} did ${describe(got)}; the frame declares ${want.action}` });
      }
      for (const intent of got) state = apply(state, intent, frame, config);
      session.draw(scene(frame, state, config));
    }
    const narrowest = narrowestFor(frame, renderer, step);
    if (narrowest !== undefined) session.resize(narrowest);
    const laid = session.read();
    const projection = project(frame, step.name, state.mode, laid);
    const context = { frame, renderer, run, step: step.name, ...(narrowest === undefined ? {} : { narrowest }), scene: scene(frame, state, config), config };
    findings.push(...checkStep(context, laid.surfaces, projection));
    projections.push(projection);
  }
  return { projections, findings };
}

/** Step by step, both ways round: a step either side lacks is a difference too. */
function compare(frame: Frame, a: readonly Projection[], b: readonly Projection[], say: (step: string, where: string) => Finding): Finding[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]] as const).flatMap(([left, right]) => {
    if (left === undefined || right === undefined) {
      const step = (left ?? right)?.step ?? "";
      return [say(step, `${step}: ${left === undefined ? "missing" : "drawn"} ≠ ${right === undefined ? "missing" : "drawn"}`)];
    }
    const where = firstDifference(frame, left, right);
    return where === undefined ? [] : [say(left.step, where)];
  });
}

/** The projections, kept to the surfaces somebody else also drew; nav 1's sections are the window's. */
function within(projections: readonly Projection[], surfaces: readonly string[]): readonly Projection[] {
  return projections.map((projection) => ({
    ...projection,
    sections: surfaces.includes("window") ? projection.sections : [],
    surfaces: Object.fromEntries(Object.entries(projection.surfaces).filter(([name]) => surfaces.includes(name))),
  }));
}

function measure(frame: Frame, renderer: ConformanceRenderer, config: Conformance, golden: Golden | undefined): { keys: readonly Projection[]; findings: Finding[] } {
  const runs = RUNS.map((run) => ({ run, ...driveOnce({ frame, renderer, run, config }) }));
  const keys = runs[0]?.projections ?? [];
  const findings = [
    ...runs.flatMap((driven) => driven.findings),
    ...audit(frame, renderer, config, undefined, "keys"),
    ...audit(frame, renderer, config, config.keys, "remapped keys"),
  ];
  for (const other of runs.slice(1)) {
    findings.push(
      ...compare(frame, keys, other.projections, (step, where) => ({
        assertion: "frame.keys_remaps_and_the_mouse_agree",
        renderer: renderer.name,
        run: other.run,
        step,
        message: `driven by ${other.run}, it differs from the default keys at ${where}`,
      })),
    );
  }
  const repeat = driveOnce({ frame, renderer, run: "keys", config });
  const again = repeat.projections;
  // What the second run broke counts as much as the first: a resize that works once is not a resize.
  findings.push(...repeat.findings.map((finding) => ({ ...finding, run: "keys, again" })));
  if (JSON.stringify(again) !== JSON.stringify(keys)) {
    findings.push({ assertion: "frame.a_projection_is_deterministic", renderer: renderer.name, message: `the same script twice: ${firstDifference(frame, keys, again) ?? "the same values, in different bytes"}` });
  }
  if (golden === undefined) {
    findings.push({ assertion: "frame.nothing_moved_since_it_was_approved", renderer: renderer.name, message: "there is no approved projection to compare with" });
  } else {
    const approved = Object.keys(golden.steps[0]?.surfaces ?? {});
    const shared = renderer.surfaces.filter((name) => approved.includes(name));
    findings.push(
      ...compare(frame, within(keys, shared), within(golden.steps, shared), (step, where) => ({
        assertion: "frame.nothing_moved_since_it_was_approved",
        renderer: renderer.name,
        step,
        message: `differs from the approved projection at ${where}`,
      })),
    );
  }
  return { keys, findings };
}

/** Per surface, every renderer that draws it against the first that does, so two menu bars are compared even when the first renderer draws none. */
function crossCheck(frame: Frame, renderers: readonly ConformanceRenderer[], keys: readonly (readonly Projection[])[]): Finding[] {
  return frame.surfaces.flatMap(({ name }) => {
    const holders = renderers.flatMap((renderer, i) => (renderer.surfaces.includes(name) && (keys[i]?.length ?? 0) > 0 ? [{ renderer, keys: keys[i] ?? [] }] : []));
    const [first, ...rest] = holders;
    if (first === undefined) return [];
    return rest.flatMap((other) =>
      compare(frame, within(first.keys, [name]), within(other.keys, [name]), (step, where) => ({
        assertion: "frame.renderers_agree_on_every_region",
        renderer: other.renderer.name,
        step,
        message: `${first.renderer.name} and ${other.renderer.name} differ first at ${where}`,
      })),
    );
  });
}

/**
 * Every renderer through the script three ways — default keys, a remapped
 * keymap, the mouse — and the default way twice, each step read back from
 * what it laid out and held to the frame, to the other renderers, and to the
 * approved projection.
 */
export function conform(frame: Frame, renderers: readonly ConformanceRenderer[], config: Conformance, golden?: Golden): Report {
  const sorted = [...renderers].sort((a, b) => a.name.localeCompare(b.name));
  const measured = sorted.map((renderer) => {
    try {
      return measure(frame, renderer, config, golden);
    } catch (error) {
      const message = `could not be driven: ${error instanceof Error ? error.message : String(error)}`;
      return { keys: [], findings: [{ assertion: "frame.every_region_sits_where_declared" as const, renderer: renderer.name, message }] };
    }
  });
  const names = sorted.map((renderer) => renderer.name);
  // Projections are kept by name, so two renderers sharing one would be compared, and approved, as one.
  const named = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))].map((name) => ({
    assertion: "frame.renderers_agree_on_every_region" as const,
    renderer: name,
    message: `${names.filter((each) => each === name).length} renderers are named ${name}; each needs a name of its own to be compared`,
  }));
  const findings = [...named, ...measured.flatMap((each) => each.findings), ...crossCheck(frame, sorted, measured.map((each) => each.keys))];
  return {
    renderers: sorted.map((renderer) => ({ name: renderer.name, unit: renderer.unit, surfaces: renderer.surfaces })),
    assertions: ASSERTIONS.map((type) => {
      const count = findings.filter((finding) => finding.assertion === type).length;
      return { type, status: count === 0 && sorted.length > 0 ? "passed" : "failed", findings: count };
    }),
    findings,
    projections: Object.fromEntries(sorted.map((renderer, i) => [renderer.name, measured[i]?.keys ?? []])),
  };
}

/** What `--approve` would write, or why it will not. */
export type Approval = { readonly golden: Golden } | { readonly refused: readonly string[] };

/**
 * The golden a set of renderers would approve: per surface, the projections
 * of the first renderer that draws it, so no surface is approved from a
 * renderer that does not draw it. Refused while anything but the golden
 * fails, while there is nothing to approve, or when a surface the previous
 * golden held is drawn by none of them — approving would drop its baseline.
 */
export function approve(frame: Frame, renderers: readonly ConformanceRenderer[], config: Conformance, previous?: Golden): Approval {
  const draft = conform(frame, renderers, config, undefined);
  const refused = draft.findings
    .filter((finding) => finding.assertion !== "frame.nothing_moved_since_it_was_approved")
    .map((finding) => `${finding.assertion}: ${finding.renderer}: ${finding.message}`);
  const drawers = new Map<string, readonly Projection[]>();
  for (const renderer of draft.renderers) {
    for (const surface of renderer.surfaces) if (!drawers.has(surface)) drawers.set(surface, draft.projections[renderer.name] ?? []);
  }
  const held = Object.keys(previous?.steps[0]?.surfaces ?? {});
  refused.push(...held.filter((surface) => !drawers.has(surface)).map((surface) => `${surface} is in the approved golden, and no renderer here draws it`));
  const window = drawers.get("window") ?? [];
  const first = [...drawers.values()][0] ?? [];
  const steps = first.map((step, i) => ({
    ...step,
    sections: window[i]?.sections ?? [],
    surfaces: Object.fromEntries(
      [...drawers.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([surface, projections]) => {
          const projected = projections[i]?.surfaces[surface];
          return projected === undefined ? [] : [[surface, projected]];
        }),
    ),
  }));
  if (steps.length === 0) refused.push("there is no projection to approve");
  return refused.length > 0 ? { refused } : { golden: { steps } };
}
