import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import IssuesService from "../../xygeni/service/issues";
import { Commands, EventEmitter, ILogger } from '../../xygeni/common/interfaces';
import { readFile } from 'fs';

import { IacXygeniIssue } from '../../xygeni/service/iac-issue';
import { SastXygeniIssue } from '../../xygeni/service/sast-issue';

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
});