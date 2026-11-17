import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { XygeniExtensionApi } from '../extension';

const EXTENSION_ID = 'xygeni-security.xygeni-scanner-vscode';

/**
 * Real end-to-end run against a Xygeni backend: connects, installs, scans the open workspace with the scanner
 * and checks what the views get. Opt-in: it needs XYGENI_E2E_URL and XYGENI_E2E_TOKEN (and a workspace with
 * findings, see XYGENI_E2E_WORKSPACE in .vscode-test.mjs); without them the suite is skipped.
 *
 *   XYGENI_E2E_URL=http://localhost:8086/deps-doctor-service XYGENI_E2E_TOKEN=... \
 *   XYGENI_E2E_WORKSPACE="/path/to/xygeni-fixture" npm run test:real
 */
suite('Real scan against a Xygeni backend (opt-in)', function () {
    const url = process.env.XYGENI_E2E_URL;
    const token = process.env.XYGENI_E2E_TOKEN;
    let api: XygeniExtensionApi;
    let root: string;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    async function waitFor(what: string, condition: () => boolean, timeoutMs: number, everyMs = 1000): Promise<void> {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if (condition()) { return; }
            await sleep(everyMs);
        }
        assert.fail(`timed out waiting for ${what}`);
    }
    const configFile = () => path.join(root, '.xygeni', 'ide.json');

    suiteSetup(async function () {
        this.timeout(60_000);
        if (!url || !token) { this.skip(); }
        root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        assert.ok(root, 'a workspace folder must be open');
        const extension = vscode.extensions.getExtension<XygeniExtensionApi>(EXTENSION_ID);
        assert.ok(extension, 'extension installed');
        api = await extension!.activate();
        await api.setXygeniUrl(url!);
        await api.setToken(token!);
    });

    suiteTeardown(async () => {
        if (!root) { return; }
        fs.rmSync(configFile(), { force: true });
    });

    test('connects, validates the licence, and has the scanner and the MCP server installed', async function () {
        this.timeout(10 * 60_000);
        const commands = api.commands();
        await vscode.commands.executeCommand('xygeni.config.testConnection');
        await waitFor('the scanner to be ready', () => commands.isInstallReady(), 9 * 60_000);
        assert.ok(commands.isLicenseAvailable(), 'an IDE licence seat is available');
        assert.ok(fs.existsSync(path.join(commands.getScannerInstallationDir(), 'xygeni')), 'scanner installed');
        await waitFor('the MCP server to be installed', () => commands.getMcpLibraryPath() !== undefined, 5 * 60_000);
        assert.strictEqual(commands.getMcpLibraryPath(), path.join(os.homedir(), '.xygeni', 'mcp', 'xygeni-mcp-server.jar'), 'shared MCP folder (#2382)');
    });

    test('a full scan limited to Secrets and SAST fills only those views (#415)', async function () {
        this.timeout(20 * 60_000);
        const commands = api.commands();
        fs.mkdirSync(path.dirname(configFile()), { recursive: true });
        fs.writeFileSync(configFile(), JSON.stringify({ scans: ['secrets', 'sast'], onSave: ['secrets', 'sast'], excludes: [] }, null, 2));
        assert.deepStrictEqual(commands.getScanConfig().scans, ['secrets', 'sast'], 'the configuration is read from the workspace file');

        await vscode.commands.executeCommand('xygeni.scan.run');
        await waitFor('the scan to start', () => commands.getScans().some((scan) => scan.status === 'running'), 30_000, 250);
        await waitFor('the scan to end', () => !commands.getScans().some((scan) => scan.status === 'running'), 18 * 60_000, 2000);
        const last = commands.getScans()[commands.getScans().length - 1];
        assert.strictEqual(last.status, 'completed', `scan completed: ${last.summary}`);

        await waitFor('the findings to be read', () => commands.getIssuesByCategory('secrets').length > 0 && commands.getIssuesByCategory('sast').length > 0, 90_000);
        assert.strictEqual(commands.getIssuesByCategory('sca').length, 0, 'SCA did not run: no findings');
        assert.strictEqual(commands.getIssuesByCategory('quality').length, 0, 'Code Quality did not run: no findings');
        assert.strictEqual(commands.getIssuesByCategory('iac').length, 0, 'IaC did not run: no findings');
    });

    test('the MCP update check answers against the real download site (#2382)', async function () {
        this.timeout(60_000);
        await vscode.commands.executeCommand('xygeni.mcp.checkUpdates');
        const status = api.commands().getMcpStatus();
        // Until version.txt is promoted to get.xygeni.io the check reports "unavailable" and the status stays unknown.
        assert.ok(status.updateAvailable === undefined || typeof status.availableVersion === 'string', 'a consistent MCP status');
    });
});
