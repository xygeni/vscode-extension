import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import IssuesService from "../../xygeni/service/issues";
import { Commands, EventEmitter, ILogger } from '../../xygeni/common/interfaces';
import { readFile } from 'fs';

import { IacXygeniIssue } from '../../xygeni/service/iac-issue';
import { SastXygeniIssue } from '../../xygeni/service/sast-issue';
import { QualityXygeniIssue } from '../../xygeni/service/quality-issue';

// Mock Logger class
class LoggerMock implements ILogger {
  public logs: string[] = [];


  log(message: string): void {
    console.log(message);
    this.logs.push(message);
  }

  error(error: Error | unknown, message: string): void {
    console.log(message);
    console.log(error);
    this.logs.push(message);
  }

  showOutput(): void {
    // Mock implementation
  }

  clear(): void {
    this.logs = [];
  }
}

class EventEmitterMock implements EventEmitter {
  emitChange(): void {
    // Mock implementation
  }
}

suite('Issues Test Suite', () => {
  let issuesService: IssuesService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    const commandsMock = {
      fileExists: sandbox.stub().resolves(true),
      readFile(filename: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
          readFile(filename, 'utf8', (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });
      }
    } as unknown as Commands;

    issuesService = IssuesService.getInstance(new LoggerMock(), new EventEmitterMock(), commandsMock);


  });

  teardown(() => {
    sandbox.restore();
  });

  test('readMisconfReport should parse misconfigurations correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'misconf.output.vscode.json');

    // reset issues
    issuesService.clear();

    await issuesService.readMisconfReport(testDataPath);

    const parsedIssues = issuesService.getIssues();

    assert.strictEqual(parsedIssues.length, 4, 'Should have 4 misconfigurations');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, 'MIS.lack_version_pinning.lack_version_pinning_npm.package.json.-1');
    assert.strictEqual(firstIssue.type, 'lack_version_pinning');
    assert.strictEqual(firstIssue.severity, 'low');
    //assert.strictEqual(firstIssue.file, 'package.json');
    //assert.strictEqual(firstIssue.beginLine, -1);
    assert.strictEqual(firstIssue.explanation, 'package.json without version pinning. No lockfile under version control found.');

    const secondIssue = parsedIssues[1];
    assert.strictEqual(secondIssue.id, 'MIS.signed_commits.signed_commits.any/test.vulnerabilities.0');
    assert.strictEqual(secondIssue.type, 'signed_commits');
    assert.strictEqual(secondIssue.severity, 'high');
    //assert.strictEqual(secondIssue.file, 'vdlr/test.vulnerabilities');
    //assert.strictEqual(secondIssue.beginLine, 0);
    assert.strictEqual(secondIssue.explanation, 'The repository has no protected branches.');
  });

  test('readSecretsReport should parse secrets correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'secrets.output.vscode.json');

    // reset issues
    issuesService.clear();

    await issuesService.readSecretsReport(testDataPath);

    const parsedIssues = issuesService.getIssues();

    assert.strictEqual(parsedIssues.length, 2, 'Should have 2 secrets');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, "SEC.data_storage_secret.postgres_assignment.iac/docker-compose.yml.6.services.pg_1.environment");
    assert.strictEqual(firstIssue.type, 'data_storage_secret');
    assert.strictEqual(firstIssue.severity, 'high');
    assert.strictEqual(firstIssue.file, 'iac/docker-compose.yml');
    assert.strictEqual(firstIssue.beginLine, 5);
    assert.strictEqual(firstIssue.explanation, "Secret of type 'data_storage_secret' detected by 'postgres_assignment'");

  });

  test('readIacReport should parse iac issues correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'iac.output.report.json');

    // reset issues
    issuesService.clear();

    await issuesService.readIacReport(testDataPath);

    const parsedIssues = issuesService.getIssues() as IacXygeniIssue[];

    assert.strictEqual(parsedIssues.length, 2, 'Should have 2 iac issues');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, "IAC.network.no_healthcheck.vendor/leafs/aloe/src/Command/themes/docker/docker/Dockerfile.1");
    assert.strictEqual(firstIssue.type, 'network');
    assert.strictEqual(firstIssue.severity, 'low');
    assert.strictEqual(firstIssue.file, 'vendor/leafs/aloe/src/Command/themes/docker/docker/Dockerfile');
    assert.strictEqual(firstIssue.beginLine, 0);
    assert.strictEqual(firstIssue.explanation, "Healthcheck instructions have not been added to container image");
    assert.strictEqual(firstIssue.resource, "php:8.1-apache");

  });

  test('readSastReport should parse sast issues correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'sast.output.js-vuln');

    // reset issues
    issuesService.clear();

    await issuesService.readSastReport(testDataPath);

    const parsedIssues = issuesService.getIssues() as SastXygeniIssue[];

    assert.strictEqual(parsedIssues.length, 5, 'Should have 2 sast issues');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, "SAS.information_leak.javascript.information_exposure_through_error_message.src/test/suite.test.ts.26");
    assert.strictEqual(firstIssue.type, 'information_leak');
    assert.strictEqual(firstIssue.severity, 'low');
    assert.strictEqual(firstIssue.file, 'src/test/suite.test.ts');
    assert.strictEqual(firstIssue.beginLine, 25);
    assert.strictEqual(firstIssue.explanation, "Generation of error message containing sensitive information");

  });

  test('processSastReport should still parse vulnerabilities when metadata is missing', () => {
    // A report whose metadata/reportProperties is absent (e.g. a partial report written when an
    // analyzer timed out) must NOT throw: the findings should still be parsed. (issue #835)
    issuesService.clear();

    const malformed = {
      // `metadata` is intentionally absent
      vulnerabilities: [
        { issueId: 'SAS.test.1', kind: 'test', detector: 'd', severity: 'high', location: { filepath: 'a.ts', beginLine: 1 } }
      ]
    };

    assert.doesNotThrow(() => issuesService.processSastReport(malformed));

    const parsed = issuesService.getIssues();
    assert.strictEqual(parsed.length, 1, 'Should parse the vulnerability despite missing metadata');
    assert.strictEqual(parsed[0].id, 'SAS.test.1');
    assert.strictEqual(parsed[0].severity, 'high');
  });

  test('readScannerOutput should keep reading other domains when one report fails', async () => {
    // A failure reading one domain (e.g. a corrupt misconf report after a timeout) must not
    // prevent the remaining domains (sast, iac, deps) from being read. (issue #835)
    issuesService.clear();

    sandbox.stub(issuesService, 'readSecretsReport').resolves();
    const misconf = sandbox.stub(issuesService, 'readMisconfReport').rejects(new Error('corrupt misconf report'));
    const sast = sandbox.stub(issuesService, 'readSastReport').resolves();
    const iac = sandbox.stub(issuesService, 'readIacReport').resolves();
    const deps = sandbox.stub(issuesService, 'readDepsReport').resolves();

    await issuesService.readScannerOutput('xygeni.xygeni-security');

    assert.ok(misconf.calledOnce, 'misconf read should be attempted');
    assert.ok(sast.calledOnce, 'sast should still be read after misconf failure');
    assert.ok(iac.calledOnce, 'iac should still be read after misconf failure');
    assert.ok(deps.calledOnce, 'deps (SCA) should still be read after misconf failure');
  });

  test('readQualityReport should parse quality issues from a real report', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'quality.output.report.json');

    // reset issues
    issuesService.clear();

    await issuesService.readQualityReport(testDataPath);

    const parsedIssues = issuesService.getIssuesByCategory('quality');

    // The real report keeps findings under `vulnerabilities` (10 items) — the
    // primary key must resolve, NOT the fallback (else this would be 0).
    assert.strictEqual(parsedIssues.length, 10, 'Should parse 10 quality issues from `vulnerabilities`');

    const first = parsedIssues[0] as QualityXygeniIssue;
    assert.strictEqual(first.id, 'SAS.reliability.javascript.strict_equals.quality/smells.js.5');
    assert.strictEqual(first.category, 'quality');
    assert.strictEqual(first.kind, 'quality_issue');
    assert.strictEqual(first.type, 'reliability');
    assert.strictEqual(first.qualityCategory, 'reliability');
    assert.strictEqual(first.detector, 'javascript.strict_equals');
    assert.strictEqual(first.severity, 'high');
    assert.strictEqual(first.file, 'quality/smells.js');
    // Lines are exposed 0-based for VS Code (AbstractXygeniIssue applies `raw - 1`),
    // so the report's beginLine/endLine=5 surface as 4 — this also proves the raw
    // field was read (not defaulted to 0).
    assert.strictEqual(first.beginLine, 4);
    assert.strictEqual(first.endLine, 4);
    assert.ok(
      first.explanation && first.explanation.startsWith('Loose equality'),
      'explanation must be mapped from the real field, not defaulted to ""',
    );
    // Guard against silent defaulting of the mapped fields.
    assert.notStrictEqual(first.file, '', 'file must not default to ""');
    assert.notStrictEqual(first.beginLine, 0, 'beginLine must not default to 0');
  });

  test('readQualityReport should yield zero issues (no throw) when the findings key does not match', async () => {
    // reset issues
    issuesService.clear();

    // A report whose top-level findings key is none of the known ones must not
    // throw and must produce zero quality issues (silent-empty is acceptable here,
    // a crash is not).
    assert.doesNotThrow(() =>
      issuesService.processQualityReport({ metadata: {}, somethingElse: [{ issueId: 'x' }] }),
    );
    assert.strictEqual(
      issuesService.getIssuesByCategory('quality').length,
      0,
      'unknown findings key → zero quality issues',
    );
  });
});