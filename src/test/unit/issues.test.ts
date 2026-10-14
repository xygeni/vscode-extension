import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import IssuesService from "../../xygeni/service/issues";
import { Commands, EventEmitter, ILogger } from '../../xygeni/common/interfaces';
import { readFile } from 'fs';

import { IacXygeniIssue } from '../../xygeni/service/iac-issue';
import { SastXygeniIssue } from '../../xygeni/service/sast-issue';
import { QualityXygeniIssue } from '../../xygeni/service/quality-issue';
import { ApisecXygeniIssue } from '../../xygeni/service/apisec-issue';
import { AiXygeniIssue } from '../../xygeni/service/ai-issue';

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

  test('readApisecReport should parse API flaws from a real report', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'apisec.output.report.json');

    // reset issues
    issuesService.clear();

    await issuesService.readApisecReport(testDataPath);

    const parsedIssues = issuesService.getIssuesByCategory('apisec');

    // The real report keeps findings under `flaws` (7 items) — NOT `vulnerabilities`,
    // which is what the SAST-family reports use. Reading the wrong key yields 0.
    assert.strictEqual(parsedIssues.length, 7, 'Should parse 7 API flaws from `flaws`');

    const first = parsedIssues[0] as ApisecXygeniIssue;
    assert.strictEqual(first.id, 'API-excessive_data_exposure_python-POST /users/v1/login');
    assert.strictEqual(first.category, 'apisec');
    assert.strictEqual(first.kind, 'api_flaw');
    assert.strictEqual(first.detector, 'excessive_data_exposure_python');
    assert.strictEqual(first.severity, 'high');
    // The tree label is the machine `flawType`; the human `title` is kept for the details panel.
    assert.strictEqual(first.type, 'excessive_data_exposure', 'type must map to flawType');
    assert.ok(
      first.title && first.title.startsWith('Response DTO returns sensitive fields'),
      'title must be mapped for the details panel',
    );
    assert.strictEqual(first.endpointMethod, 'POST');
    assert.strictEqual(first.endpointPath, '/users/v1/login');
    assert.strictEqual(first.endpoint, 'POST /users/v1/login');
    assert.deepStrictEqual(first.owaspApiTop10, ['API3:2023']);
    assert.deepStrictEqual(first.cwes, ['CWE-213', 'CWE-200']);
    assert.strictEqual(first.branch, 'origin/master');
    assert.ok(
      first.explanation && first.explanation.length > 0,
      'explanation must be mapped from the real field, not defaulted to ""',
    );
    assert.ok(first.remediation && first.remediation.length > 0, 'remediation must be mapped');
  });

  test('readApisecReport resolves the file of location-less flaws from the API inventory', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'apisec.output.report.json');

    // reset issues
    issuesService.clear();

    await issuesService.readApisecReport(testDataPath);

    // No flaw in the real report carries a `location`. Six are endpoint-scoped and resolve through
    // `services[].modules[].endpoints[]` (endpointId is "<METHOD> <path>") to the handler file and
    // line; the service-scoped one has no endpoint and resolves through `properties.handler_file`.
    const parsedIssues = issuesService.getIssuesByCategory('apisec') as ApisecXygeniIssue[];
    const issuesById = new Map(parsedIssues.map((issue) => [issue.id, issue]));

    const login = issuesById.get('API-excessive_data_exposure_python-POST /users/v1/login')!;
    assert.strictEqual(login.file, 'api_views/users.py');
    assert.strictEqual(login.beginLine, 84, 'handler line 85, exposed 0-based');

    const deleteUser = issuesById.get('API-broken_function_level_authorization-DELETE /users/v1/{username}')!;
    assert.strictEqual(deleteUser.file, 'api_views/users.py');
    assert.strictEqual(deleteUser.beginLine, 205);

    const bookByTitle = issuesById.get('API-excessive_data_exposure_python-GET /books/v1/{book_title}')!;
    assert.strictEqual(bookByTitle.file, 'api_views/books.py');
    assert.strictEqual(bookByTitle.beginLine, 44);

    const rateLimit = issuesById.get('API-rate_limit_absence-service:VAmPI')!;
    assert.strictEqual(rateLimit.endpointPath, undefined, 'service-scoped: no endpoint');
    assert.strictEqual(rateLimit.file, 'api_views/users.py', 'falls back to properties.handler_file');
    assert.strictEqual(rateLimit.beginLine, 0, 'handler_file carries no line');

    assert.ok(parsedIssues.every((issue) => issue.file !== ''), 'every flaw of the real report resolves a file');
    assert.ok(parsedIssues.every((issue) => issue.code === ''), 'the inventory has no source excerpt');
  });

  test('processApisecReport falls back to the module spec file, and keeps flaws it cannot locate', () => {
    // reset issues
    issuesService.clear();

    issuesService.processApisecReport({
      metadata: {},
      currentBranch: 'main',
      services: [{ name: 'svc', modules: [{ name: 'mod', location: { file: 'openapi/spec.yml' }, endpoints: [] }] }],
      flaws: [
        { issueId: 'API-in-known-module', detector: 'd', title: 't', severity: 'low', moduleName: 'mod' },
        { issueId: 'API-in-unknown-module', detector: 'd', title: 't', severity: 'low', moduleName: 'other' },
      ],
    });

    const [viaSpecFile, unresolved] = issuesService.getIssuesByCategory('apisec') as ApisecXygeniIssue[];
    assert.strictEqual(viaSpecFile.file, 'openapi/spec.yml', 'module-scoped: the module spec file');
    assert.strictEqual(viaSpecFile.beginLine, 0);
    assert.strictEqual(unresolved.file, '', 'nothing to resolve → empty file, finding kept');
    assert.strictEqual(unresolved.getCodeSnippetHtmlTab(), '', 'no snippet tab without a location');
  });

  test('apisec details escape scanner strings before interpolating them into the webview', () => {
    issuesService.clear();

    issuesService.processApisecReport({
      metadata: {},
      flaws: [{
        issueId: 'API-x', detector: 'd', severity: 'low',
        title: 'Title <script>alert(1)</script>',
        endpointMethod: 'GET', endpointPath: '/users/<img src=x onerror=alert(1)>',
        moduleName: '"mod"', serviceName: "svc'",
      }],
    });

    const [issue] = issuesService.getIssuesByCategory('apisec') as ApisecXygeniIssue[];
    const html = issue.getIssueDetailsHtml() + issue.getSubtitleLineHtml();
    assert.ok(!html.includes('<script>'), 'title must not inject a tag');
    assert.ok(!html.includes('<img'), 'endpoint path must not inject a tag');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the title text is still shown');
    assert.ok(html.includes('&quot;mod&quot;') && html.includes('svc&#39;'), 'quotes are escaped');
  });

  test('readScannerOutput with the incremental scan types re-reads only their reports and keeps the rest', async () => {
    issuesService.clear();

    // A finding from a report the incremental scan does NOT rewrite: it must survive the re-read.
    issuesService.processApisecReport({ metadata: {}, flaws: [{ issueId: 'API-kept', detector: 'd', title: 't', severity: 'low' }] });

    const secrets = sandbox.stub(issuesService, 'readSecretsReport').resolves();
    const iac = sandbox.stub(issuesService, 'readIacReport').resolves();
    const sast = sandbox.stub(issuesService, 'readSastReport').resolves();
    const misconf = sandbox.stub(issuesService, 'readMisconfReport').resolves();
    const deps = sandbox.stub(issuesService, 'readDepsReport').resolves();
    const quality = sandbox.stub(issuesService, 'readQualityReport').resolves();
    const apisec = sandbox.stub(issuesService, 'readApisecReport').resolves();
    const ai = sandbox.stub(issuesService, 'readAiReport').resolves();

    await issuesService.readScannerOutput('xygeni.xygeni-security', ['secrets', 'iac', 'sast', 'malware']);

    assert.ok(secrets.calledOnce && iac.calledOnce && sast.calledOnce, 'the scan types that ran are re-read');
    assert.ok(misconf.notCalled && deps.notCalled && quality.notCalled && apisec.notCalled && ai.notCalled,
      'reports of scan types that did not run are stale and must not be re-read');
    assert.strictEqual(issuesService.getIssuesByCategory('apisec').length, 1, 'their current findings are kept');

    // A full read replaces every category.
    await issuesService.readScannerOutput('xygeni.xygeni-security');
    assert.ok(apisec.calledOnce, 'full read reads every report');
    assert.strictEqual(issuesService.getIssuesByCategory('apisec').length, 0, 'full read replaces every category');
  });

  test('readApisecReport should yield zero issues (no throw) when the findings key does not match', () => {
    // reset issues
    issuesService.clear();

    assert.doesNotThrow(() =>
      issuesService.processApisecReport({ metadata: {}, services: [{ name: 'x' }] }),
    );
    assert.strictEqual(
      issuesService.getIssuesByCategory('apisec').length,
      0,
      'the API inventory (services/dataObjects) is not a findings stream → zero issues',
    );
  });

  test('readAiReport should parse AI vulnerabilities from a real report', async () => {
    const testDataPath = path.join(__dirname, 'issues.test.data', 'ai.output.report.json');

    // reset issues
    issuesService.clear();

    await issuesService.readAiReport(testDataPath);

    const parsedIssues = issuesService.getIssuesByCategory('ai');
    assert.strictEqual(parsedIssues.length, 9, 'Should parse 9 AI vulnerabilities from `vulnerabilities`');

    // `AIVulnerability` does not reuse the SAST names: getSeverity() / getIssueId() / getDetector() /
    // getExplanation() are @JsonIgnore, so the wire keys are `severityFloor`, `id`, `detectorId`
    // and `description`. Reading the SAST names here would silently default every field.
    const first = parsedIssues[0] as AiXygeniIssue;
    assert.strictEqual(first.category, 'ai');
    assert.strictEqual(first.kind, 'ia_vulnerability');
    assert.strictEqual(first.severity, 'high', 'severity must come from `severityFloor`');
    assert.strictEqual(first.id, 'prompt-pinned-to-mutable-label:ai/prompt_registry.py:31', 'id must come from `id`');
    assert.strictEqual(first.detector, 'prompt-pinned-to-mutable-label', 'detector must come from `detectorId`');
    assert.strictEqual(first.type, 'prompt-pinned-to-mutable-label', 'the AI report has no kind/type field');
    assert.ok(
      first.explanation && first.explanation.startsWith('Registry prompt is referenced by a floating / mutable label'),
      'explanation must come from `description`',
    );
    assert.strictEqual(first.assetKind, 'ai_prompt');
    // `standards[]` entries serialize the standard name as `std`, never `standard`.
    assert.deepStrictEqual(first.standards, ['LLM01', 'ASI06']);
    assert.deepStrictEqual(first.redTeamVectors, ['PromptInjection', 'RAGPoisoning']);
    assert.ok(first.remediationHint && first.remediationHint.startsWith('Pin the prompt to an immutable version'));
    assert.strictEqual(first.file, 'ai/prompt_registry.py');
    assert.strictEqual(first.beginLine, 30, 'lines are exposed 0-based');
    assert.strictEqual(first.code, 'return langfuse.get_prompt("support/summarizer")');
    assert.strictEqual(first.branch, 'unknown');
    // `util rectify --ai` exists (RectifyCommand.java), so the FIX IT tab must be offered.
    assert.strictEqual(first.remediableLevel, 'AUTO');
  });

  test('processAiReport keeps the standard name when a standards entry has no controlId', () => {
    // reset issues
    issuesService.clear();

    issuesService.processAiReport({
      metadata: {},
      vulnerabilities: [{ id: 'x', detectorId: 'd', severityFloor: 'low', standards: [{ std: 'owasp-llm-top10', version: '2025' }] }],
    });

    const first = issuesService.getIssuesByCategory('ai')[0] as AiXygeniIssue;
    assert.deepStrictEqual(first.standards, ['owasp-llm-top10']);
  });

  test('processAiReport should yield zero issues (no throw) when the findings key does not match', () => {
    // reset issues
    issuesService.clear();

    assert.doesNotThrow(() => issuesService.processAiReport({ metadata: {}, somethingElse: [{ id: 'x' }] }));
    assert.strictEqual(
      issuesService.getIssuesByCategory('ai').length,
      0,
      'unknown findings key → zero AI issues',
    );
  });
});
