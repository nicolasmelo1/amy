import { sameJson, type Intent, type Json } from "@amykit/ui";
import { buildKeymap, type ConformanceRenderer, type Frame, type KeyOverrides, type Mode } from "@amykit/ui/frame";
import type { Finding } from "./checks.js";
import { scene, START, type ConformanceConfig } from "./world.js";

/** The count every normal-mode binding is pressed with once more, the way `3j` is. */
const COUNT = 3;

const said = (intents: readonly Intent[]): string =>
  intents.length === 0 ? "nothing" : intents.map((intent) => `${intent.action}${Object.keys(intent.args).length === 0 ? "" : ` ${JSON.stringify(intent.args)}`}`).join(", ");

/**
 * Every binding and every gesture the frame declares, each in a session of
 * its own, so a key the script never presses is held to the frame as well:
 * each key once, each normal-mode key again after a count, each gesture once.
 */
export function audit(frame: Frame, renderer: ConformanceRenderer, config: ConformanceConfig, keys: KeyOverrides | undefined, run: string): Finding[] {
  const keymap = buildKeymap(frame, keys);
  const findings: Finding[] = [];
  const expect = (did: string, got: readonly Intent[], action: string, args: { readonly [key: string]: Json }): void => {
    if (got.length === 1 && got[0]?.action === action && sameJson(got[0].args, args)) return;
    findings.push({ assertion: "frame.every_key_does_what_it_is_declared_to", renderer: renderer.name, run, message: `${did} did ${said(got)}; the frame declares ${said([{ action, args }])}` });
  };
  const fresh = (mode: Mode) => {
    const session = renderer.start({ frame, ...(keys === undefined ? {} : { keys }) });
    session.draw(scene(frame, { ...START, mode }, config));
    return session;
  };
  for (const mode of ["normal", "insert"] as const) {
    for (const binding of keymap.bindings[mode]) {
      const session = fresh(mode);
      expect(`${binding.keys.join("")} in ${mode} mode, on its own,`, binding.keys.flatMap((key) => session.press(key)), binding.action, {});
      // After a count, 0 is one more digit of it, as in Neovim: a binding that begins with 0 takes no count.
      if (mode !== "normal" || binding.keys[0] === "0") continue;
      const counted = fresh(mode);
      const pressed = [String(COUNT), ...binding.keys].flatMap((key) => counted.press(key));
      expect(`${COUNT}${binding.keys.join("")} in normal mode`, pressed, binding.action, { count: COUNT });
    }
  }
  for (const [gesture, targets] of Object.entries(frame.mouse)) {
    for (const [on, action] of Object.entries(targets)) {
      expect(`${gesture} on ${on}, on its own,`, fresh("normal").pointer({ gesture, on, args: {} }), action, {});
    }
  }
  return findings;
}
