/**
 * One harness this machine could run, and whether it is here.
 *
 * A harness is detected by its own home directory, not by a binary on PATH:
 * the directory is what its skills and its login live under, and a binary
 * without them is not a harness amy can drive.
 */
export interface Harness {
  /** The name the asks offer: claude, codex, hermes. */
  readonly name: string;
  /** The package that mounts it. */
  readonly plugin: string;
  /** Whether its home directory is on this machine. */
  readonly detected: boolean;
}

/**
 * The harnesses this machine could run.
 *
 * The whole listing rather than only the detected ones, because the ask
 * offers every harness with the detected ones first — a machine without the
 * harness the person uses is exactly the one that must still be able to
 * name it.
 */
export interface Harnesses {
  /** Every harness amy knows, the ones detected here marked. */
  all(): Promise<readonly Harness[]>;
}
