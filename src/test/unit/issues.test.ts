import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import IssuesService from "../../xygeni/service/issues";
import { EventEmitter, ILogger } from '../../xygeni/common/interfaces';

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
  let issues: IssuesService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    issues = IssuesService.getInstance(new LoggerMock(), new EventEmitterMock());
    sandbox = sinon.createSandbox();

  });

  teardown(() => {
    sandbox.restore();
  });

  test('readMisconfReport should parse misconfigurations correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'misconf.output.vscode.json');

    await issues.readMisconfReport(testDataPath);

    const parsedIssues = IssuesService.getInstance().getIssues();

    assert.strictEqual(parsedIssues.length, 4, 'Should have 4 misconfigurations');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, 'MIS.lack_version_pinning.lack_version_pinning_npm.package.json.-1');
    assert.strictEqual(firstIssue.type, 'lack_version_pinning');
    assert.strictEqual(firstIssue.severity, 'low');
    //assert.strictEqual(firstIssue.file, 'package.json');
    //assert.strictEqual(firstIssue.line, -1);
    assert.strictEqual(firstIssue.description, 'package.json without version pinning. No lockfile under version control found.');

    const secondIssue = parsedIssues[1];
    assert.strictEqual(secondIssue.id, 'MIS.signed_commits.signed_commits.vdlr/test.vulnerabilities.0');
    assert.strictEqual(secondIssue.type, 'signed_commits');
    assert.strictEqual(secondIssue.severity, 'high');
    //assert.strictEqual(secondIssue.file, 'vdlr/test.vulnerabilities');
    //assert.strictEqual(secondIssue.line, 0);
    assert.strictEqual(secondIssue.description, 'The repository has no protected branches.');
  });

  test('readSecretsReport should parse secrets correctly', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'secrets.output.vscode.json');

    await issues.readMisconfReport(testDataPath);

    const parsedIssues = IssuesService.getInstance().getIssues();

    assert.strictEqual(parsedIssues.length, 4, 'Should have 4 misconfigurations');

    const firstIssue = parsedIssues[0];
    assert.strictEqual(firstIssue.id, 'MIS.lack_version_pinning.lack_version_pinning_npm.package.json.-1');
    assert.strictEqual(firstIssue.type, 'lack_version_pinning');
    assert.strictEqual(firstIssue.severity, 'low');
    assert.strictEqual(firstIssue.file, 'package.json');
    assert.strictEqual(firstIssue.line, -1);
    assert.strictEqual(firstIssue.description, 'package.json without version pinning. No lockfile under version control found.');

    const secondIssue = parsedIssues[1];
    assert.strictEqual(secondIssue.id, 'MIS.signed_commits.signed_commits.vdlr/test.vulnerabilities.0');
    assert.strictEqual(secondIssue.type, 'signed_commits');
    assert.strictEqual(secondIssue.severity, 'high');
    assert.strictEqual(secondIssue.file, 'vdlr/test.vulnerabilities');
    assert.strictEqual(secondIssue.line, 0);
    assert.strictEqual(secondIssue.description, 'The repository has no protected branches.');
  });
});