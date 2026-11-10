import { Result } from "./result.js";

/**
 * Installs a package the person chose.
 *
 * Only what the person chose ever goes through here, which is what the
 * guarantee "only the harness, workflow and plugins the person chose are
 * installed" is made of. Installing a package that is already installed is
 * green, not a refusal: `amy setup slack` on a machine that has slack must
 * go on to configure it, not stop to say it is there.
 */
export interface Installer {
  /**
   * Installs one package spec.
   *
   * Refused when npm says no, naming the package and npm's first error
   * line; internal when the install could not even be attempted.
   */
  install(spec: string): Promise<Result<void>>;
}
