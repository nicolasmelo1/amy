import { WorkRecord } from "../work.js";

/**
 * Where the record of one piece of work is kept between looks.
 *
 * Generic over the record, because the shape past the four fields the core
 * reads belongs to whichever workflow is mounted. A store needs only an id
 * to key a record: what else the record carries is the workflow's, and a
 * file store that demanded the core's four fields could not keep a record
 * written by hand or by an older amy.
 */
export interface Store<R extends { id: string } = WorkRecord> {
  load(workId: string): R | null;
  save(record: R): void;
  all(): R[];
  /**
   * Reads, changes and writes one record while no other writer can move it.
   *
   * A caller that loads, edits and saves in three steps loses whatever a
   * concurrent save did in between. Optional so a store that keeps no files
   * is not forced to invent a lock, but a caller that must not lose a move
   * has to find it here.
   */
  update?(workId: string, change: (record: R) => R | undefined): R | null;
}
