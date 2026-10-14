import fs from 'fs';
import path from 'path';

// Scanner exit-code contract (ErrorCodes.java): 0 ok, 1..127 failed, 128..255 ran and found issues.
// 127 is ambiguous: an unlicensed scan type is skipped while the licensed ones run and write their
// reports, but a missing, expired or locked licence also ends every scan type with 127 and writes nothing.
export const LICENSE_ERROR_EXIT_CODE = 127;
export const ANY_ISSUE_FOUND_EXIT_CODE = 128;

/**
 * Whether the scanner run produced usable output. 127 counts only for the `scan` command (for
 * `util rectify` it means nothing was done) and only when this run wrote at least one report.
 */
export function isCompletedRun(exitCode: number | null, isScanCommand: boolean, wroteReportThisRun: boolean): boolean {
  if (exitCode === null) { return false; }
  if (exitCode === 0 || exitCode >= ANY_ISSUE_FOUND_EXIT_CODE) { return true; }
  return isScanCommand && exitCode === LICENSE_ERROR_EXIT_CODE && wroteReportThisRun;
}

/** True when some `<type>.<reportSuffix>` in `outputDir` was written at or after `startTime` (epoch ms). */
export function hasReportWrittenSince(outputDir: string, reportSuffix: string, startTime: number): boolean {
  let entries: string[];
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return false;
  }
  return entries
    .filter((entry) => entry.endsWith(`.${reportSuffix}`))
    .some((entry) => {
      try {
        return fs.statSync(path.join(outputDir, entry)).mtimeMs >= startTime;
      } catch {
        return false;
      }
    });
}

/** Process start as a whole second, so a filesystem with 1s mtime granularity cannot date a fresh report before it. */
export function reportFreshnessStartTime(now: number = Date.now()): number {
  return Math.floor(now / 1000) * 1000;
}
