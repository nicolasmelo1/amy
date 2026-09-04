/**
 * The handbrake.
 *
 * Deliberately not a plugin: a switch that depends on plugins loading cannot
 * stop a run whose plugins are what went wrong.
 */
export interface StopSwitch {
  isRequested(): boolean;
  reason(): string | null;
  request(reason: string): void;
  clear(): void;
  /**
   * Calls back as soon as a stop is requested, and returns the function that
   * stops watching.
   *
   * Checking at boundaries alone is not enough: an agent call can run for
   * half an hour, and a handbrake nobody pulls until the next boundary is not
   * a handbrake.
   */
  watch(onRequested: (reason: string) => void): () => void;
}
