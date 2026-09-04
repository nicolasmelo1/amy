import { WorkRecord } from "../work.js";

/**
 * Where the record of one piece of work is kept between looks.
 *
 * Generic over the record, because the shape past the four fields the core
 * reads belongs to whichever workflow is mounted.
 */
export interface Store<R extends WorkRecord = WorkRecord> {
  load(workId: string): R | null;
  save(record: R): void;
  all(): R[];
}
