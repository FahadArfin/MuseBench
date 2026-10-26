export interface FileDiffRow {
  /** Line content without LF; a preceding CR is retained for lossless CRLF text. */
  text: string;
  kind: 'context' | 'removed' | 'added';
  oldLine: number | null;
  newLine: number | null;
  /** This source line has no terminating LF. */
  noNewline: boolean;
}

export interface FileDiff {
  /** Full-file totals, independent of the materialized row limit. */
  additions: number;
  deletions: number;
  /** At most 10,000 rows from the beginning of the comparison. */
  rows: FileDiffRow[];
  /** True when a bounded comparison replaced the unmatched middle wholesale. */
  approximate: boolean;
  /** True when rows omit a suffix of the comparison. */
  truncated: boolean;
  totalRows: number;
}

/** Pure LF-delimited comparison for text snapshots (at most 2 MiB per file).
 * Terminators participate in matching; binary files must be handled by callers.
 */
export function computeFileDiff(before: string, after: string): FileDiff;
