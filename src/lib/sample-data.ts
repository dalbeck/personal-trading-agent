/**
 * Sample-data honesty (see `.agents/data-format.md`). Seeded/demo records carry
 * `sample: true`; live records written by the routines/scout omit it. Any view
 * that renders one or more sample records must surface a clear "Sample data"
 * indicator so fabricated content is never shown as if it were live.
 *
 * Client-safe (no `server-only`): both the server pages and the client list
 * components import these.
 */

/** A record that may be seeded sample/demo content rather than live data. */
export interface MaybeSample {
  sample?: boolean;
}

/** True when any record is sample/demo content, so the view must flag it. */
export function anySample(records: ReadonlyArray<MaybeSample>): boolean {
  return records.some((r) => r.sample === true);
}

/** Banner copy shown when a view is rendering seeded sample data. */
export const SAMPLE_DATA_MESSAGE =
  "Showing seeded sample data for demonstration — not live trading activity. " +
  "Clear it from Operations → Clear sample data to see the real empty states.";
