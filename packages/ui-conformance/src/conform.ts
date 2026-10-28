import { sameJson, type Intent } from "@amykit/ui";
import { buildKeymap, keysFor, type ConformanceRenderer, type Frame, type KeyOverrides, type Session } from "@amykit/ui/frame";
import { ASSERTIONS, checkStep, type Assertion, type Finding } from "./checks.js";
import { firstDifference, project, type Projection } from "./projection.js";
import { RUNS, SCRIPT, type Move, type Run } from "./script.js";
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
      if (got.length !== 1 || got[0]?.action !== want.action || !sameJson(got[0].args, want.args)) {
        findings.push({ assertion: "frame.every_key_does_what_it_is_declared_to", renderer: renderer.name, run, step: step.name, message: `${did} did ${describe(got)}; the frame declares ${want.action}` });
      }
      for (const intent of got) state = apply(state, intent, frame, config);
      session.draw(scene(frame, state, config));
    }
    if (step.narrowest) session.resize(renderer.unit === "px" ? frame.narrowest.px : frame.narrowest.cells);
    const laid = session.read();
    const projection = project(frame, step.name, state.mode, laid);
    const context = { frame, renderer, run, step: step.name, narrowest: step.narrowest === true, scene: scene(frame, state, config), config };
    findings.push(...checkStep(context, laid.surfaces, projection));
    projections.push(projection);
  }
  return { projections, findings };
}

function compare(frame: Frame, a: readonly Projection[], b: readonly Projection[], say: (step: string, where: string) => Finding): Finding[] {
  return a.flatMap((projection, i) => {
    const where = firstDifference(frame, projection, b[i]);
    return where === undefined ? [] : [say(projection.step, where)];
  });
}

/** The projections, kept to the surfaces somebody else also drew. */
function within(projections: readonly Projection[], surfaces: readonly string[]): readonly Projection[] {
  return projections.map((projection) => ({
    ...projection,
    surfaces: Object.fromEntries(Object.entries(projection.surfaces).filter(([name]) => surfaces.includes(name))),
  }));
}

function measure(frame: Frame, renderer: ConformanceRenderer, config: Conformance, golden: Golden | undefined): { keys: readonly Projection[]; findings: Finding[] } {
  const runs = RUNS.map((run) => ({ run, ...driveOnce({ frame, renderer, run, config }) }));
  const keys = runs[0]?.projections ?? [];
  const findings = runs.flatMap((driven) => driven.findings);
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
  const again = driveOnce({ frame, renderer, run: "keys", config }).projections;
  if (JSON.stringify(again) !== JSON.stringify(keys)) {
    findings.push({ assertion: "frame.a_projection_is_deterministic", renderer: renderer.name, message: `the same script twice: ${firstDifference(frame, keys, again) ?? "the same values, in different bytes"}` });
  }
  if (golden === undefined) {
    findings.push({ assertion: "frame.nothing_moved_since_it_was_approved", renderer: renderer.name, message: "there is no approved projection to compare with" });
  } else {
    const approved = Object.keys(golden.steps[0]?.surfaces ?? {});
    findings.push(
      ...compare(frame, within(keys, renderer.surfaces), within(golden.steps, renderer.surfaces.filter((name) => approved.includes(name))), (step, where) => ({
        assertion: "frame.nothing_moved_since_it_was_approved",
        renderer: renderer.name,
        step,
        message: `differs from the approved projection at ${where}`,
      })),
    );
  }
  return { keys, findings };
}

function crossCheck(frame: Frame, renderers: readonly ConformanceRenderer[], keys: readonly (readonly Projection[])[]): Finding[] {
  const [first, ...rest] = renderers;
  if (first === undefined) return [];
  return rest.flatMap((other, i) => {
    const shared = first.surfaces.filter((surface) => other.surfaces.includes(surface));
    return compare(frame, within(keys[0] ?? [], shared), within(keys[i + 1] ?? [], shared), (step, where) => ({
      assertion: "frame.renderers_agree_on_every_region",
      renderer: other.name,
      step,
      message: `${first.name} and ${other.name} differ first at ${where}`,
    }));
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
  const findings = [...measured.flatMap((each) => each.findings), ...crossCheck(frame, sorted, measured.map((each) => each.keys))];
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
