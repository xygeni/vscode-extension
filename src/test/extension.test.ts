import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { EventEmitter as NodeEventEmitter } from 'events';
import XygeniScannerService from '../xygeni/service/scanner';
import { XyContextImpl } from '../xygeni/common/context';
import { XYGENI_CONTEXT } from '../xygeni/common/constants';
import { DetailsView } from '../xygeni/views/details-view';
import LicenseStateService from '../xygeni/service/license-state';

const EXTENSION_ID = 'xygeni-security.xygeni-scanner-vscode';

const noopOutputChannel = {
    append: () => undefined,
    appendLine: () => undefined,
    show: () => undefined,
    clear: () => undefined,
};

function fakeScannerSingleton() {
    // Pass mocks so getInstance() succeeds even if the extension hasn't fully wired
    // the singleton (e.g. when activation failed silently due to a missing workspace).
    // If a real singleton already exists, the mocks are ignored.
    return XygeniScannerService.getInstance(
        { getXygeniUrl: () => undefined } as any,
        { log: () => undefined, error: () => undefined, showOutput: () => undefined } as any
    );
}

async function setLicenseAvailable(value: boolean): Promise<void> {
    await XyContextImpl.getInstance().setKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE, value);
}

async function setLicenseFree(value: boolean): Promise<void> {
    await XyContextImpl.getInstance().setKey(XYGENI_CONTEXT.LICENSE_FREE, value);
}

function resetLicenseStateSingleton(): void {
    (LicenseStateService as any).instance = undefined;
}

suite('Xygeni Extension — E2E inside VS Code', () => {

    suiteSetup(async function () {
        this.timeout(60_000);
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `extension ${EXTENSION_ID} must be installed`);
        await extension!.activate();
    });

    teardown(async () => {
        // Reset to fail-closed between tests so each test starts in a known state.
        await setLicenseAvailable(false);
        await setLicenseFree(false);
    });

    test('extension activates', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, 'extension lookup');
        assert.strictEqual(extension!.isActive, true, 'extension active after activate()');
    });

    test('registers core scanner commands', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'xygeni.scan.run',
            'xygeni.scan.toggleAutoScan',
            'xygeni.scan.install',
            'xygeni.config.testConnection',
            'xygeni.config.editUrl',
            'xygeni.config.editToken',
            'xygeni.license.upgrade',
        ];
        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `command ${cmd} should be registered`);
        }
    });

    test('AI Explain (#400): runAiExplainCommand writes JSON to a temp file and passes --issue-json-file', async function () {
        this.timeout(15_000);

        const scanner = fakeScannerSingleton();

        const writeSpy = sinon.spy(fs.promises, 'writeFile');
        const unlinkSpy = sinon.spy(fs.promises, 'unlink');

        const issueJson = JSON.stringify({
            kind: 'sast_vulnerability',
            detector: 'java.sql_injection',
            code: 'rs=stmt.executeQuery("select * from users where username=\'"+user+"\' and password=\'"+pass+"\'")',
            codeFlows: [['deps.xygeni.xygeni-security', 'iac.xygeni.xygeni-security']]
        });

        const result = scanner.runAiExplainCommand(
            issueJson,
            '/tmp/xygeni-test-ai-explain-out.md',
            '/tmp/no-such-xygeni-install',
            noopOutputChannel as any
        );

        await new Promise((r) => setTimeout(r, 100));

        const writeCall = writeSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && /xygeni-issue-.*\.json$/.test(c.args[0] as string)
        );
        assert.ok(writeCall, 'expected fs.promises.writeFile to be called with xygeni-issue-*.json path');
        assert.strictEqual(writeCall!.args[1], issueJson, 'temp file should contain the exact issue JSON');

        await result.catch(() => undefined);

        const tempPath = writeCall!.args[0] as string;
        const unlinkedSame = unlinkSpy.getCalls().some((c) => c.args[0] === tempPath);
        assert.ok(unlinkedSame, 'temp JSON file should be unlinked after the command settles');

        writeSpy.restore();
        unlinkSpy.restore();
    });

    test('Gating (#401): xygeni.scan.run is a no-op when LICENSE_IDE_AVAILABLE is false', async () => {
        const scanner = fakeScannerSingleton();
        await setLicenseAvailable(false);

        assert.strictEqual(scanner.isScannerRunning(), false, 'scanner not running before');
        await vscode.commands.executeCommand('xygeni.scan.run');
        assert.strictEqual(
            scanner.isScannerRunning(),
            false,
            'scanner must remain idle when license is not available'
        );
    });

    test('Gating (#401): xygeni.scan.run shows the license warning when license unavailable', async () => {
        fakeScannerSingleton();
        await setLicenseAvailable(false);

        const warnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
        try {
            await vscode.commands.executeCommand('xygeni.scan.run');
            assert.ok(warnStub.calledOnce, 'showWarningMessage must be called once');
            const firstArg = warnStub.firstCall.args[0] as string;
            assert.match(firstArg, /License is not available/i, 'warning message should mention the missing license');
        } finally {
            warnStub.restore();
        }
    });

    test('Gating (#401): XyContext.setKey persists LICENSE_IDE_AVAILABLE for getKey', async () => {
        await setLicenseAvailable(true);
        assert.strictEqual(
            XyContextImpl.getInstance().getKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE),
            true,
            'after setKey(true), getKey must return true'
        );
        await setLicenseAvailable(false);
        assert.strictEqual(
            XyContextImpl.getInstance().getKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE),
            false,
            'after setKey(false), getKey must return false'
        );
    });

    test('Free License (#187): XyContext.setKey persists LICENSE_FREE for getKey', async () => {
        await setLicenseFree(true);
        assert.strictEqual(
            XyContextImpl.getInstance().getKey(XYGENI_CONTEXT.LICENSE_FREE),
            true,
            'after setKey(true), getKey must return true'
        );
        await setLicenseFree(false);
        assert.strictEqual(
            XyContextImpl.getInstance().getKey(XYGENI_CONTEXT.LICENSE_FREE),
            false,
            'after setKey(false), getKey must return false'
        );
    });

    test('Free License (#187): xygeni.license.upgrade opens the Xygeni pricing page', async function () {
        this.timeout(5_000);

        const openExternalStub = sinon.stub(vscode.env, 'openExternal').resolves(true);
        try {
            await vscode.commands.executeCommand('xygeni.license.upgrade');

            assert.ok(openExternalStub.calledOnce, 'openExternal must be called once');
            const uriArg = openExternalStub.firstCall.args[0] as vscode.Uri;
            assert.strictEqual(
                uriArg.toString(),
                'https://xygeni.io/pricing/',
                'upgrade command must open the Xygeni pricing URL'
            );
        } finally {
            openExternalStub.restore();
        }
    });

    test('Free License (#187): LicenseStateService parses /license/state and exposes isFreeLicense', async function () {
        this.timeout(5_000);

        resetLicenseStateSingleton();

        const fakeRequest = new NodeEventEmitter();
        const fakeResponse: any = new NodeEventEmitter();
        fakeResponse.statusCode = 200;
        fakeResponse.resume = () => undefined;

        let capturedUrl: string | undefined;
        let capturedToken: string | undefined;
        const fakeClient: any = {
            setAuthToken: (token: string) => { capturedToken = token; return fakeClient; },
            get: (url: string, cb: (res: any) => void) => {
                capturedUrl = url;
                setTimeout(() => {
                    cb(fakeResponse);
                    fakeResponse.emit('data', JSON.stringify({ dataLicensePlan: { licenseType: 'free' } }));
                    fakeResponse.emit('end');
                }, 5);
                return fakeRequest;
            },
            post: () => fakeRequest,
        };

        const fakeLogger: any = { log: () => undefined, error: () => undefined, showOutput: () => undefined };
        const fakeCommands: any = {
            getXygeniUrl: () => 'https://api.xygeni.io',
            getHttpClient: () => fakeClient,
        };

        const service = LicenseStateService.getInstance(fakeLogger, fakeCommands);
        const licenseType = await service.refresh('token-xyz');

        assert.strictEqual(licenseType, 'free', 'refresh() must resolve the licenseType from the response body');
        assert.strictEqual(service.isFreeLicense(), true, 'isFreeLicense() must be true for licenseType="free"');
        assert.strictEqual(capturedToken, 'token-xyz', 'token must be forwarded to the HTTP client');
        assert.strictEqual(capturedUrl, 'https://api.xygeni.io/license/state', 'URL must hit /license/state');

        resetLicenseStateSingleton();
    });

    test('Free License (#187): non-free licenseType in /license/state leaves isFreeLicense false', async function () {
        this.timeout(5_000);

        resetLicenseStateSingleton();

        const fakeRequest = new NodeEventEmitter();
        const fakeResponse: any = new NodeEventEmitter();
        fakeResponse.statusCode = 200;
        fakeResponse.resume = () => undefined;
        const fakeClient: any = {
            setAuthToken: () => fakeClient,
            get: (_url: string, cb: (res: any) => void) => {
                setTimeout(() => {
                    cb(fakeResponse);
                    fakeResponse.emit('data', JSON.stringify({ dataLicensePlan: { licenseType: 'enterprise' } }));
                    fakeResponse.emit('end');
                }, 5);
                return fakeRequest;
            },
            post: () => fakeRequest,
        };
        const fakeLogger: any = { log: () => undefined, error: () => undefined, showOutput: () => undefined };
        const fakeCommands: any = {
            getXygeniUrl: () => 'https://api.xygeni.io',
            getHttpClient: () => fakeClient,
        };

        const service = LicenseStateService.getInstance(fakeLogger, fakeCommands);
        await service.refresh('token');

        assert.strictEqual(service.getLicenseType(), 'enterprise');
        assert.strictEqual(service.isFreeLicense(), false, 'enterprise must not be treated as free');

        resetLicenseStateSingleton();
    });

    test('Gating (#401): DetailsView.handleExplainAction bails out without invoking the CLI when license unavailable', async () => {
        await setLicenseAvailable(false);

        const scanner = fakeScannerSingleton();
        const runAiSpy = sinon.spy(scanner, 'runAiExplainCommand');
        const warnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

        const postedMessages: any[] = [];
        const panelMock = {
            webview: {
                postMessage: (msg: any) => {
                    postedMessages.push(msg);
                    return Promise.resolve(true);
                },
            },
        };

        const commandsMock = {
            isInstallReady: () => true,
            isLicenseAvailable: () => false,
        };

        try {
            DetailsView.handleExplainAction(panelMock as any, { vulnJson: '{"k":1}', file: 'a.java' }, commandsMock as any);
            // give any promise-based side effects a tick to flush
            await new Promise((r) => setTimeout(r, 20));

            assert.strictEqual(runAiSpy.called, false, 'runAiExplainCommand must NOT be invoked when license is unavailable');
            assert.ok(warnStub.calledOnce, 'showWarningMessage must be called');
            assert.ok(
                postedMessages.some((m) => m && m.status === 'explainError'),
                'webview must receive explainError status'
            );
        } finally {
            runAiSpy.restore();
            warnStub.restore();
        }
    });

    // ---- Scan configuration (#415) and MCP (#2382) ----

    test('Scan configuration (#415) and MCP (#2382): commands are registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        for (const cmd of ['xygeni.scan.toggleScanType', 'xygeni.scan.toggleOnSaveScanType', 'xygeni.scan.selectAllScanTypes',
            'xygeni.scan.clearScanTypes', 'xygeni.scan.restoreDefaults', 'xygeni.scan.openConfigFile', 'xygeni.scan.addExcludeFolder',
            'xygeni.scan.addExcludePattern', 'xygeni.scan.removeExclude', 'xygeni.mcp.checkUpdates', 'xygeni.showMcpSetup']) {
            assert.ok(commands.includes(cmd), `command ${cmd} should be registered`);
        }
    });

    test('Configuration webview (#415): the view is contributed and can be focused', async function () {
        this.timeout(15_000);
        const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
        const views = extension.packageJSON.contributes.views.xygeni as { id: string; type?: string }[];
        const configuration = views.find((view) => view.id === 'xygeni.views.configuration');
        assert.ok(configuration, 'xygeni.views.configuration is contributed');
        assert.strictEqual(configuration!.type, 'webview', 'Configuration is a webview view');
        assert.ok(!views.some((view) => view.id === 'xygeni.views.scan'), 'the old Scan tree view is gone (folded into Configuration)');
        await XyContextImpl.getInstance().setKey(XYGENI_CONTEXT.WELCOME, false);
        await XyContextImpl.getInstance().setKey(XYGENI_CONTEXT.WORKSPACE_FOUND, true);
        await vscode.commands.executeCommand('xygeni.views.configuration.focus');
    });

    test('Scan configuration (#415): toggles write .xygeni/ide.json in the workspace and the defaults remove it', async function () {
        this.timeout(15_000);
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { this.skip(); }
        const file = `${root}/.xygeni/ide.json`;
        await vscode.commands.executeCommand('xygeni.scan.restoreDefaults');
        assert.strictEqual(fs.existsSync(file), false, 'defaults write nothing');

        await vscode.commands.executeCommand('xygeni.scan.toggleScanType', 'quality');
        assert.ok(fs.existsSync(file), 'a change writes the file');
        let config = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.ok(!config.scans.includes('quality'), 'quality switched off');
        assert.deepStrictEqual(config.onSave, ['secrets', 'iac', 'sast', 'malware']);

        await vscode.commands.executeCommand('xygeni.scan.toggleScanType', 'sast');
        config = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.ok(!config.scans.includes('sast') && !config.onSave.includes('sast'), 'on-save follows the full scan');

        await vscode.commands.executeCommand('xygeni.scan.clearScanTypes');
        config = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.strictEqual(config.scans.length, 10, 'clearing falls back to every type: the scanner needs at least one');

        await vscode.commands.executeCommand('xygeni.scan.removeExclude', 'nothing');
        await vscode.commands.executeCommand('xygeni.scan.restoreDefaults');
        assert.strictEqual(fs.existsSync(file), false, 'restoring the defaults removes the file');
    });

    test('Scan configuration (#415): the scanner builds --run and --exclude-add from the configuration', () => {
        const scanner = fakeScannerSingleton();
        scanner.setScanConfig({ scans: ['secrets', 'sast', 'deps', 'suspectdeps'], onSave: ['secrets', 'sast'], excludes: ['vendor/**', '**/gen/**'], options: [] });
        const full = scanner.buildScanArgs(false);
        const incremental = scanner.buildScanArgs(true);
        assert.strictEqual(full[1], '--run=secrets,sast,deps,suspectdeps');
        assert.ok(full.includes('--exclude-add=vendor/**,**/gen/**'), 'excludes go as --exclude-add, never -e');
        assert.ok(!full.includes('--incremental'));
        assert.strictEqual(incremental[1], '--run=secrets,sast');
        assert.ok(incremental.includes('--incremental') && incremental.includes('--exclude-add=vendor/**,**/gen/**'));
        scanner.setScanConfig({ scans: ['secrets'], onSave: ['secrets'], excludes: [], options: [] });
        assert.ok(!scanner.buildScanArgs(false).some((arg) => arg.startsWith('--exclude')), 'no excludes, no argument');
        scanner.setScanConfig({ scans: ['secrets', 'sast', 'deps', 'suspectdeps'], onSave: ['secrets'], excludes: [], options: ['--ai-review=all', '--run=secrets'] });
        const withOptions = scanner.buildScanArgs(false);
        assert.ok(withOptions.includes('--ai-review=all'), 'scanner options go to the command line');
        assert.strictEqual(withOptions.filter((arg) => arg.startsWith('--run')).length, 1, 'a managed option in the file is ignored');
        assert.strictEqual(scanner.buildScanArgs(false, ['sast'])[1], '--run=sast', 'the play button of a results view runs that type alone');
        assert.ok(!scanner.buildScanArgs(false, ['sast']).includes('--incremental'));
    });

    test('Shell-free spawning (#2628, CWE-77): a workspace path with shell metacharacters reaches the scanner as one argument, with shell: false', async function () {
        this.timeout(15_000);
        const scanner = fakeScannerSingleton();
        // The singleton may carry the minimal fake commands of this suite: give it what the scanner call reads.
        const commands = (scanner as any).commands;
        if (typeof commands.getWsLocalStorage !== 'function') { commands.getWsLocalStorage = () => os.tmpdir(); }
        if (typeof commands.getToken !== 'function') { commands.getToken = async () => 'test-token'; }
        if (typeof commands.getProxySettings !== 'function') { commands.getProxySettings = () => ({}); }

        // The real module object: scanner.ts calls child_process.spawn through it, so stubbing it here intercepts the call.
        const childProcess = require('child_process');
        const spawnStub = sinon.stub(childProcess, 'spawn').callsFake(() => {
            const proc: any = new NodeEventEmitter();
            proc.stdout = new NodeEventEmitter();
            proc.stderr = new NodeEventEmitter();
            proc.kill = () => undefined;
            setTimeout(() => proc.emit('close', 0), 10);
            return proc;
        });
        try {
            const hostile = path.join(os.tmpdir(), 'ws $(touch pwned) `id` ; rm -rf x | cat && echo "q" \'s\'');
            scanner.setScanConfig({ scans: ['secrets'], onSave: ['secrets'], excludes: ['dir with space/**'], options: ['--mute=my mutes/profile.yml'] });
            await scanner.runAnalysisCommand(hostile, '/tmp/no-such-xygeni-install', noopOutputChannel as any).catch(() => undefined);

            assert.strictEqual(spawnStub.callCount, 1, 'the scanner is spawned once');
            const [command, args, options] = spawnStub.firstCall.args as [string, string[], any];
            assert.strictEqual(options.shell, false, 'never through a shell');
            assert.ok(Array.isArray(args), 'arguments go as an array, not a command string');
            assert.ok(!command.includes(hostile), 'the command is the scanner launcher, not a concatenated line');
            assert.strictEqual(args[args.indexOf('-d') + 1], hostile, 'the workspace path is one untouched argument');
            assert.ok(args.includes('--exclude-add=dir with space/**') && args.includes('--mute=my mutes/profile.yml'), 'settings with spaces stay single arguments');
            assert.ok(args.every((arg) => typeof arg === 'string'), 'plain strings only');
        } finally {
            spawnStub.restore();
        }
    });

    test('Shell-free spawning (#2628): only an absolute, existing $SHELL is used to read JAVA_HOME; anything else falls back to /bin/bash', () => {
        assert.strictEqual(XygeniScannerService.loginShell('/bin/sh'), '/bin/sh');
        assert.strictEqual(XygeniScannerService.loginShell('/bin/sh; touch /tmp/pwned'), '/bin/bash', 'a shell "path" with a command in it is not a path');
        assert.strictEqual(XygeniScannerService.loginShell('zsh'), '/bin/bash', 'relative names are not resolved through PATH');
        assert.strictEqual(XygeniScannerService.loginShell('/no/such/shell'), '/bin/bash');
        assert.strictEqual(XygeniScannerService.loginShell(undefined), '/bin/bash');
    });

    test('MCP (#2382): xygeni.mcp.checkUpdates reports instead of throwing when the server is not installed or the version is unavailable', async function () {
        this.timeout(30_000);
        const warnStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as any);
        const infoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined as any);
        try {
            await vscode.commands.executeCommand('xygeni.mcp.checkUpdates');
            const messages = [...warnStub.args, ...infoStub.args].map((args) => String(args[0]));
            assert.ok(messages.length > 0, 'a manual check always answers');
            assert.ok(messages.some((m) => /MCP server/.test(m)), `the answer is about the MCP server: ${messages.join(' | ')}`);
        } finally {
            warnStub.restore();
            infoStub.restore();
        }
    });
});
