import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as sinon from 'sinon';
import XygeniScannerService from '../xygeni/service/scanner';
import { XyContextImpl } from '../xygeni/common/context';
import { XYGENI_CONTEXT } from '../xygeni/common/constants';
import { DetailsView } from '../xygeni/views/details-view';

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
});
