import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ANY_ISSUE_FOUND_EXIT_CODE,
  LICENSE_ERROR_EXIT_CODE,
  hasReportWrittenSince,
  isCompletedRun,
  reportFreshnessStartTime,
} from '../../xygeni/service/scan-exit-code';

const REPORT_SUFFIX = 'xygeni.xygeni-security';

suite('Scan exit code Test Suite', () => {

  test('isCompletedRun accepts 0 and every issues-found code for any command', () => {
    assert.strictEqual(isCompletedRun(0, true, false), true);
    assert.strictEqual(isCompletedRun(0, false, false), true);
    assert.strictEqual(isCompletedRun(ANY_ISSUE_FOUND_EXIT_CODE, true, false), true, '128 = ran and found issues');
    assert.strictEqual(isCompletedRun(129, false, false), true);
  });

  test('isCompletedRun rejects failures, a killed process and 127 outside `scan`', () => {
    assert.strictEqual(isCompletedRun(2, true, true), false);
    assert.strictEqual(isCompletedRun(null, true, true), false, 'killed by signal');
    // `util rectify` exiting 127 did nothing: the temp file is not a fix.
    assert.strictEqual(isCompletedRun(LICENSE_ERROR_EXIT_CODE, false, true), false);
  });

  test('isCompletedRun accepts 127 for `scan` only when this run wrote a report', () => {
    assert.strictEqual(isCompletedRun(LICENSE_ERROR_EXIT_CODE, true, true), true, 'an unlicensed type was skipped, the rest ran');
    assert.strictEqual(isCompletedRun(LICENSE_ERROR_EXIT_CODE, true, false), false, 'licence missing/expired/locked: nothing ran');
  });

  test('hasReportWrittenSince only counts reports dated at or after the start of this run', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), `xygeni-exit-code-${crypto.randomBytes(4).toString('hex')}-`));
    try {
      assert.strictEqual(hasReportWrittenSince(outputDir, REPORT_SUFFIX, 0), false, 'empty output dir');

      const staleReport = path.join(outputDir, `sast.${REPORT_SUFFIX}`);
      fs.writeFileSync(staleReport, '{}');
      const staleTime = new Date(Date.now() - 60_000);
      fs.utimesSync(staleReport, staleTime, staleTime);

      const startTime = reportFreshnessStartTime();
      assert.strictEqual(hasReportWrittenSince(outputDir, REPORT_SUFFIX, startTime), false, 'a report from a previous run does not count');

      fs.writeFileSync(path.join(outputDir, `scanner.log`), 'not a report');
      assert.strictEqual(hasReportWrittenSince(outputDir, REPORT_SUFFIX, startTime), false, 'other files are ignored');

      fs.writeFileSync(path.join(outputDir, `secrets.${REPORT_SUFFIX}`), '{}');
      assert.strictEqual(hasReportWrittenSince(outputDir, REPORT_SUFFIX, startTime), true, 'a report written by this run counts');
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test('hasReportWrittenSince is false for a missing output dir', () => {
    assert.strictEqual(hasReportWrittenSince(path.join(os.tmpdir(), 'xygeni-does-not-exist'), REPORT_SUFFIX, 0), false);
  });

  test('reportFreshnessStartTime floors to the second so 1s mtime granularity cannot predate a fresh report', () => {
    assert.strictEqual(reportFreshnessStartTime(1_700_000_000_999), 1_700_000_000_000);
    assert.strictEqual(reportFreshnessStartTime(1_700_000_000_000), 1_700_000_000_000);
  });
});
