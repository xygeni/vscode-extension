import * as vscode from 'vscode';
import { ConfigManager } from '../config/xygeni-configuration';
import { ScanResult, XyContext, XygeniIssue, McpStatus } from '../common/interfaces';
import { XYGENI_CONTEXT } from '../common/constants';
import { GLOBAL_OPTION_TOGGLES } from '../service/scanner-options';
import { ON_SAVE_SCANNERS, SCAN_CONFIG_DIR, SCAN_CONFIG_FILE, SWITCHABLE_SCANNERS, ScanConfig, ScanType, ScannerOption, isDefaultScanConfig } from '../service/scan-config';
import { MANAGED_SCAN_OPTIONS, SCAN_OPTIONS } from '../service/scan-options';

/** What the view needs from the extension (CommandsImpl provides it). */
export interface ConfigurationWebviewHost {
    refreshConfigEventEmitter: vscode.Event<void>;
    refreshScannerEventEmitter: vscode.Event<void>;
    refreshIssuesEventEmitter: vscode.Event<void>;
    getXygeniUrl(): string | undefined;
    getToken(): Promise<string | undefined>;
    isConnectionChecked(): boolean;
    getScans(): ScanResult[];
    getIssuesByCategory(category: string): XygeniIssue[];
    getMcpStatus(): McpStatus;
    getMcpLibraryPath(): string | undefined;
    getIconPath(iconName: string): string;
    editUrl(): Promise<void>;
    editToken(): Promise<void>;
    refreshAndInstall(override?: boolean): Promise<unknown>;
    installScanner(override?: boolean): Promise<unknown>;
    runScanner(): Promise<void>;
    toggleAutoScan(): Promise<void>;
    toggleGlobalOption(setting: string): Promise<void>;
    openUpgradePage(): void;
    openProxySettings(): void;
    showScanOutput(): void;
    showMcpSetupView(): void;
    checkMcpUpdates(force: boolean): Promise<void>;
    getScanConfig(): ScanConfig;
    getScanConfigPath(): string | undefined;
    toggleScanType(type: ScanType, enabled?: boolean): void;
    toggleOnSaveScanType(type: ScanType, enabled?: boolean): void;
    setAllScanTypes(enabled: boolean): void;
    restoreScanDefaults(): void;
    addExcludeFolder(): Promise<void>;
    addExcludePattern(): Promise<void>;
    removeExclude(pattern: string): void;
    /** @returns the error to show next to the input, or undefined when added */
    addScanOption(text: string): string | undefined;
    removeScanOption(name: string): void;
    openScanConfigFile(): Promise<void>;
}

/** The icon of each scanner row, from media/icons (the same files the issue views use). */
const SCANNER_ICONS: Record<string, string> = {
    secrets: 'secrets.svg', sast: 'code-sec-new.svg', deps: 'open-source.svg', iac: 'iacNew.svg', misconf: 'misconf.svg',
    malware: 'malware.svg', quality: 'code-quality.svg', apisec: 'api-security.svg', ai: 'ai-security.svg', suspectdeps: 'open-source.svg'
};

/** The findings categories of the result views, with the view each chip focuses. */
const RESULT_CATEGORIES: { category: string; label: string; view: string; scanType: string }[] = [
    { category: 'secrets', label: 'Secrets', view: 'xygeni.views.secrets', scanType: 'secrets' },
    { category: 'sast', label: 'SAST', view: 'xygeni.views.sast', scanType: 'sast' },
    { category: 'sca', label: 'SCA', view: 'xygeni.views.sca', scanType: 'deps' },
    { category: 'iac', label: 'IaC', view: 'xygeni.views.iac', scanType: 'iac' },
    { category: 'misconf', label: 'CI/CD', view: 'xygeni.views.cicd', scanType: 'misconf' },
    { category: 'malware', label: 'Malware', view: 'xygeni.views.malware', scanType: 'malware' },
    { category: 'quality', label: 'Quality', view: 'xygeni.views.quality', scanType: 'quality' },
    { category: 'apisec', label: 'API', view: 'xygeni.views.apisec', scanType: 'apisec' },
    { category: 'ai', label: 'AI', view: 'xygeni.views.ai', scanType: 'ai' }
];

/** The state the page renders; sent again after every change. */
interface ConfigurationState {
    connection: {
        url: string; hasToken: boolean; configValid: boolean; checked: boolean; connecting: boolean; connectionReady: boolean;
        installing: boolean; installReady: boolean; installError: boolean; licenseAvailable: boolean; licenseFree: boolean;
        autoScan: boolean;
        options: { setting: string; label: string; option: string; enabled: boolean; alwaysVisible: boolean }[];
        mcp: { installed: boolean; path?: string; installedVersion?: string; availableVersion?: string; updateAvailable?: boolean; updateMode: string };
    };
    scan: {
        running: boolean;
        history: { time: string; status: string; summary: string }[];
        counts: { category: string; label: string; view: string; count: number; inFullScan: boolean }[];
        total: number;
    };
    scanConfig: { config: ScanConfig; isDefault: boolean; file: string };
}

/**
 * The Xygeni "Configuration" view (xygeni/xygeni-product-backlog#415): one webview section with three collapsible
 * blocks: Connection (URL, token, scanner status, Auto Scan on Save, scanner options, MCP), Scan (run, history and
 * findings per category) and Scan configuration (one row per scanner with Full scan / On save switches, excluded
 * folders). The page only shows the state it is sent and reports clicks back; the logic stays in the commands.
 */
export class ConfigurationWebview implements vscode.WebviewViewProvider {
    public static readonly viewType = 'xygeni.views.configuration';

    private view: vscode.WebviewView | undefined;

    /**
     * @param isViewVisible whether a result view is currently shown expanded; VS Code cannot collapse a sidebar
     * section from an extension, so a second click on a chip collapses that tree's nodes and comes back here.
     */
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly host: ConfigurationWebviewHost,
        private readonly xygeniContext: XyContext,
        private readonly isViewVisible: (view: string) => boolean = () => false
    ) {
        this.host.refreshConfigEventEmitter(() => this.refresh());
        this.host.refreshScannerEventEmitter(() => this.refresh());
        this.host.refreshIssuesEventEmitter(() => this.refresh());
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this.onMessage(message));
        webviewView.onDidChangeVisibility(() => { if (webviewView.visible) { this.refresh(); } });
        this.refresh();
    }

    /** Sends the current state to the page. */
    public refresh(): void {
        if (!this.view) { return; }
        void this.buildState().then((state) => this.view?.webview.postMessage({ type: 'state', state }));
    }

    private async buildState(): Promise<ConfigurationState> {
        const flag = (key: string) => !!this.xygeniContext.getKey(key);
        const url = this.host.getXygeniUrl() ?? '';
        const token = await this.host.getToken();
        const mcp = this.host.getMcpStatus();
        const config = this.host.getScanConfig();
        const scans = this.host.getScans();
        const counts = RESULT_CATEGORIES.map(entry => ({
            category: entry.category, label: entry.label, view: entry.view,
            count: this.host.getIssuesByCategory(entry.category).length,
            inFullScan: config.scans.includes(entry.scanType as ScanType)
        }));
        return {
            connection: {
                url, hasToken: !!token, configValid: !!url && !!token, checked: this.host.isConnectionChecked(),
                connecting: flag(XYGENI_CONTEXT.CONNECTING), connectionReady: flag(XYGENI_CONTEXT.CONNECTION_READY),
                installing: flag(XYGENI_CONTEXT.INSTALLING), installReady: flag(XYGENI_CONTEXT.INSTALL_READY), installError: flag(XYGENI_CONTEXT.INSTALL_ERROR),
                licenseAvailable: flag(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE), licenseFree: flag(XYGENI_CONTEXT.LICENSE_FREE),
                autoScan: ConfigManager.getAutoScan(),
                options: GLOBAL_OPTION_TOGGLES.map(toggle => ({ setting: toggle.setting, label: toggle.label, option: toggle.option, enabled: ConfigManager.getScanFlag(toggle.setting), alwaysVisible: toggle.alwaysVisible })),
                mcp: { installed: flag(XYGENI_CONTEXT.MCP_LIBRARY_INSTALLED), path: this.host.getMcpLibraryPath(), ...mcp }
            },
            scan: {
                running: scans.some(scan => scan.status === 'running'),
                history: [...scans].reverse().slice(0, 5).map(scan => ({ time: scan.timestamp.toLocaleString(), status: scan.status, summary: scan.summary })),
                counts,
                total: counts.reduce((sum, entry) => sum + entry.count, 0)
            },
            scanConfig: { config, isDefault: isDefaultScanConfig(config), file: this.host.getScanConfigPath() ?? `${SCAN_CONFIG_DIR}/${SCAN_CONFIG_FILE}` }
        };
    }

    private async onMessage(message: { type: string; key?: ScanType; enabled?: boolean; pattern?: string; setting?: string; view?: string; text?: string; name?: string }): Promise<void> {
        switch (message.type) {
            case 'ready': this.refresh(); break;
            // connection
            case 'editUrl': await this.host.editUrl(); break;
            case 'editToken': await this.host.editToken(); break;
            case 'connect': void this.host.refreshAndInstall(); break;
            case 'reinstall': void this.host.refreshAndInstall(true); break;
            case 'install': void this.host.installScanner(); break;
            case 'toggleAutoScan': await this.host.toggleAutoScan(); break;
            case 'toggleOption': if (message.setting) { await this.host.toggleGlobalOption(message.setting); } break;
            case 'upgrade': this.host.openUpgradePage(); break;
            case 'settings': this.host.openProxySettings(); break;
            case 'mcpSetup': this.host.showMcpSetupView(); break;
            case 'mcpCheck': await this.host.checkMcpUpdates(true); break;
            // scan
            case 'runScan': void this.host.runScanner(); break;
            case 'scanOutput': this.host.showScanOutput(); break;
            case 'focusView':
                if (message.view) {
                    if (this.isViewVisible(message.view)) {
                        await vscode.commands.executeCommand(`workbench.actions.treeView.${message.view}.collapseAll`);
                        await vscode.commands.executeCommand(`${ConfigurationWebview.viewType}.focus`);
                    } else {
                        await vscode.commands.executeCommand(`${message.view}.focus`);
                    }
                }
                break;
            // scan configuration
            case 'toggleScan': if (message.key) { this.host.toggleScanType(message.key, message.enabled); } break;
            case 'toggleOnSave': if (message.key) { this.host.toggleOnSaveScanType(message.key, message.enabled); } break;
            case 'selectAll': this.host.setAllScanTypes(true); break;
            case 'clear': this.host.setAllScanTypes(false); break;
            case 'restoreDefaults': this.host.restoreScanDefaults(); break;
            case 'addFolder': await this.host.addExcludeFolder(); break;
            case 'addPattern': await this.host.addExcludePattern(); break;
            case 'removeExclude': if (message.pattern) { this.host.removeExclude(message.pattern); } break;
            case 'addOption': {
                const error = this.host.addScanOption(String(message.text ?? ''));
                void this.view?.webview.postMessage(error ? { type: 'optionError', error } : { type: 'optionAdded' });
                break;
            }
            case 'removeOption': if (message.name) { this.host.removeScanOption(message.name); } break;
            case 'openFile': await this.host.openScanConfigFile(); break;
        }
    }

    private html(webview: vscode.Webview): string {
        const iconUri = (scanner: ScannerOption) =>
            webview.asWebviewUri(vscode.Uri.file(this.host.getIconPath(SCANNER_ICONS[scanner.key] ?? 'secrets.svg'))).toString();
        const onSaveKeys = ON_SAVE_SCANNERS.map(scanner => scanner.key);
        return renderConfigurationPage({
            nonce: getNonce(),
            cspSource: webview.cspSource,
            rows: SWITCHABLE_SCANNERS.map(scanner => ({ key: scanner.key, label: scanner.label, description: scanner.description, icon: iconUri(scanner), onSave: onSaveKeys.includes(scanner.key) })),
            scannerCount: SWITCHABLE_SCANNERS.length,
            onSaveCount: ON_SAVE_SCANNERS.length,
            scanOptions: SCAN_OPTIONS,
            managedOptions: MANAGED_SCAN_OPTIONS
        });
    }
}

export interface ConfigurationPageOptions {
    nonce: string;
    cspSource: string;
    rows: { key: string; label: string; description: string; icon: string; onSave: boolean }[];
    scannerCount: number;
    onSaveCount: number;
    /** The `xygeni scan` options the autocompletion offers, and the managed ones with the reason they are refused. */
    scanOptions: readonly { name: string; kind: string; description: string; values?: readonly string[]; closed?: boolean; placeholder?: string }[];
    managedOptions: Readonly<Record<string, string>>;
    /** Extra CSS for a standalone preview outside VS Code (theme variable fallbacks). */
    previewCss?: string;
}

/** The page. Exported so it can be rendered outside VS Code to look at it. */
export function renderConfigurationPage(options: ConfigurationPageOptions): string {
    const { nonce, cspSource, rows, scannerCount, onSaveCount, scanOptions, managedOptions } = options;
    // Into the page script: JSON is a JS literal, and `<` is escaped so the data cannot close the script tag.
    const asJs = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
    const sw = (kind: string, key: string, label: string) =>
        `<label class="sw"><input type="checkbox" role="switch" data-switch="${kind}" data-key="${key}" aria-label="${escapeHtml(label)}" /><span class="track"></span></label>`;
    const rowsHtml = rows.map(row => `
        <div class="row">
            <img class="icon" src="${row.icon}" alt="" />
            <div class="text"><div class="label">${escapeHtml(row.label)}</div><div class="desc">${escapeHtml(row.description)}</div></div>
            ${sw('scan', row.key, `${row.label} in the full scan`)}
            ${row.onSave ? sw('onSave', row.key, `${row.label} on save`)
                : `<span class="dash" title="${escapeHtml(row.label)} scans the whole project, not just the changed files: not available on save">—</span>`}
        </div>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Xygeni configuration</title>
    <style nonce="${nonce}">
        ${options.previewCss ?? ''}
        body { margin: 0; padding: 4px 10px 12px 10px; line-height: 1.4; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
        a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; white-space: nowrap; }
        a:hover { text-decoration: underline; }
        code { font-family: var(--vscode-editor-font-family); }
        .muted { color: var(--vscode-descriptionForeground); }
        .small { font-size: 0.85em; }
        .block { margin-bottom: 0; }
        .block.open { margin-bottom: 8px; }
        .blockhead { display: flex; align-items: center; gap: 6px; padding: 4px 0; cursor: pointer; user-select: none; }
        .blockhead .chev { display: inline-block; width: 10px; color: var(--vscode-descriptionForeground); transition: transform .15s; }
        .block.open .blockhead .chev { transform: rotate(90deg); }
        .blockhead .title { font-weight: 600; text-transform: uppercase; font-size: 0.8em; letter-spacing: .04em; }
        .blockhead .sub { color: var(--vscode-descriptionForeground); font-size: 0.85em; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .blockbody { display: none; padding: 4px 0 6px 2px; }
        .block.open .blockbody { display: block; }
        .kv { display: grid; grid-template-columns: 92px 1fr; gap: 5px 10px; align-items: center; margin: 4px 0 6px 0; }
        .kv .k { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
        .kv .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .status { display: flex; align-items: center; gap: 6px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-descriptionForeground); flex: none; }
        .dot.ok { background: var(--vscode-testing-iconPassed, #73c991); }
        .dot.err { background: var(--vscode-testing-iconFailed, #f14c4c); }
        .dot.busy { background: var(--vscode-progressBar-background, #0078d4); animation: pulse 1s infinite alternate; }
        @keyframes pulse { from { opacity: .35; } to { opacity: 1; } }
        .toggles { margin: 10px 0 4px 0; }
        .trow { display: flex; align-items: center; gap: 8px; padding: 6px 2px; border-radius: 3px; }
        .trow:hover { background: var(--vscode-list-hoverBackground); }
        .trow .text { flex: 1; min-width: 0; }
        .trow .desc { color: var(--vscode-descriptionForeground); font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .head { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 6px 0; }
        .head .title { font-weight: 600; }
        .head .count { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
        .head .spacer { flex: 1; }
        .head a { font-size: 0.9em; }
        .cols { display: grid; grid-template-columns: 1fr 52px 52px; gap: 6px; padding: 0 2px 4px 0; color: var(--vscode-descriptionForeground); font-size: 0.8em; white-space: nowrap; }
        .cols span:not(:first-child) { text-align: center; }
        .row { display: grid; grid-template-columns: 18px 1fr 52px 52px; align-items: center; gap: 8px; padding: 6px 2px; border-radius: 3px; }
        .row:hover { background: var(--vscode-list-hoverBackground); }
        .icon { width: 16px; height: 16px; }
        .text { min-width: 0; }
        .label { line-height: 1.3; }
        .desc { color: var(--vscode-descriptionForeground); font-size: 0.85em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sw { position: relative; display: inline-block; width: 30px; height: 16px; justify-self: center; cursor: pointer; flex: none; }
        .sw input { position: absolute; opacity: 0; width: 0; height: 0; }
        .sw .track { position: absolute; inset: 0; border-radius: 8px; background: var(--vscode-checkbox-border, #6b6b6b); transition: background .15s; }
        .sw .track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--vscode-checkbox-background, #fff); transition: transform .15s; }
        .sw input:checked + .track { background: var(--vscode-button-background); }
        .sw input:checked + .track::after { transform: translateX(14px); background: var(--vscode-button-foreground); }
        .sw input:focus-visible + .track { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
        .sw input:disabled + .track { opacity: 0.4; cursor: default; }
        .sw.dim .track { opacity: 0.45; }
        .dash { text-align: center; color: var(--vscode-descriptionForeground); justify-self: center; }
        .note { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 8px 2px 0 2px; }
        .warn { color: var(--vscode-errorForeground); font-size: 0.85em; margin: 4px 2px 0 2px; }
        .ex { display: flex; align-items: center; gap: 6px; padding: 4px 8px; margin: 4px 0; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 3px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
        .ex .pat { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ex button, .iconbtn { background: none; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; padding: 0 2px; font-size: 1em; line-height: 1; }
        .ex button:hover { color: var(--vscode-errorForeground); }
        .actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
        button.btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 3px 10px; cursor: pointer; font-size: 0.9em; }
        button.btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        button.btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        button.btn.primary:hover { background: var(--vscode-button-hoverBackground); }
        button.btn:disabled { opacity: .5; cursor: default; }
        .foot { display: flex; gap: 8px; align-items: baseline; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); color: var(--vscode-descriptionForeground); font-size: 0.85em; }
        .foot .spacer { flex: 1; }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 4px 0; }
        .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 0.85em; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); cursor: pointer; background: transparent; color: var(--vscode-foreground); }
        .chip:hover { background: var(--vscode-list-hoverBackground); }
        .chip .n { font-weight: 600; }
        .chip.zero { color: var(--vscode-descriptionForeground); }
        .chip.off { opacity: .45; text-decoration: line-through; }
        .hist { margin: 4px 0; }
        .hrow { display: flex; align-items: center; gap: 6px; padding: 2px 2px; font-size: 0.9em; }
        .hrow .t { color: var(--vscode-descriptionForeground); white-space: nowrap; }
        .hrow .s { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sep { border: none; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); margin: 8px 0; }
        .ex .name { color: var(--vscode-textLink-foreground); }
        .ex .val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acwrap { position: relative; margin-top: 8px; }
        .acrow { display: flex; gap: 6px; align-items: center; }
        .acrow input { flex: 1; min-width: 0; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 4px 6px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; outline: none; }
        .acrow input:focus { border-color: var(--vscode-focusBorder); }
        .acrow input.bad { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
        .acrow input.good { border-color: var(--vscode-testing-iconPassed, #3fb950); }
        .ac { position: absolute; left: 0; right: 0; top: 100%; z-index: 5; max-height: 190px; overflow-y: auto; background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border)); border-radius: 3px; display: none; }
        .ac.open { display: block; }
        .ac .it { display: flex; gap: 8px; align-items: baseline; padding: 3px 8px; cursor: pointer; font-size: 0.9em; white-space: nowrap; overflow: hidden; }
        .ac .it .nm { font-family: var(--vscode-editor-font-family); flex: none; }
        .ac .it .ds { color: var(--vscode-descriptionForeground); font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; }
        .ac .it.sel, .ac .it:hover { background: var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-activeSelectionBackground)); color: var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-list-activeSelectionForeground)); }
        .ac .it.sel .ds, .ac .it:hover .ds { color: inherit; opacity: .8; }
        .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 4px 2px 0 2px; min-height: 1.2em; }
        .hint.err { color: var(--vscode-errorForeground); }
    </style>
</head>
<body>
    <div class="block" id="blk-connection">
        <div class="blockhead" data-block="connection"><span class="chev">▶</span><span class="title">Connection</span><span class="sub" id="connSub"></span></div>
        <div class="blockbody">
            <div class="kv">
                <span class="k">Xygeni URL</span><span class="v"><a id="editUrl" title="Click to change"></a></span>
                <span class="k">Token</span><span class="v"><a id="editToken" title="Click to change"></a></span>
                <span class="k">Scanner</span><span class="v status"><span class="dot" id="cliDot"></span><a id="cliAction"></a></span>
                <span class="k">License</span><span class="v status" id="licenseRow"><span class="dot" id="licDot"></span><span id="licText"></span><a id="upgrade">Upgrade</a></span>
            </div>
            <div class="toggles">
                <div class="trow"><div class="text"><div>Auto Scan on Save</div><div class="desc" id="autoScanDesc">Runs the on-save scan types when a file is saved</div></div>${sw('autoScan', 'autoScan', 'Auto Scan on Save')}</div>
                <div id="options"></div>
            </div>
            <hr class="sep" />
            <div class="kv">
                <span class="k">MCP server</span><span class="v status"><span class="dot" id="mcpDot"></span><span id="mcpText"></span></span>
            </div>
            <div class="actions"><a id="mcpSetup">MCP Setup</a><a id="mcpCheck">Check for updates</a><span style="flex:1"></span><a id="settings">All settings</a></div>
        </div>
    </div>

    <div class="block open" id="blk-scan">
        <div class="blockhead" data-block="scan"><span class="chev">▶</span><span class="title">Scan</span><span class="sub" id="scanSub"></span></div>
        <div class="blockbody">
            <div class="actions"><button class="btn primary" id="runScan">▶ Run scan</button><a id="scanOutput">Scanner output</a></div>
            <div class="chips" id="chips"></div>
            <div class="hist" id="hist"></div>
        </div>
    </div>

    <div class="block" id="blk-scanconfig">
        <div class="blockhead" data-block="scanconfig"><span class="chev">▶</span><span class="title">Scan configuration</span><span class="sub" id="cfgSub"></span></div>
        <div class="blockbody">
            <div class="head"><span class="title">What to scan</span><span class="spacer"></span><a id="selectAll">Select all</a><a id="clear">Clear</a></div>
            <div class="cols"><span></span><span title="The scan types of Run scan. With SCA on, suspect dependencies also run. At least one is required.">Full scan</span><span title="The scan types of Auto Scan on Save. Only the scan types that can analyze just the changed files are offered; the others would scan the whole project on every save. A type must be in the full scan to run on save.">On save</span></div>
            ${rowsHtml}
            <div class="warn" id="scanNote"></div>
            <div class="head"><span class="title">Excluded folders</span><span class="count" id="excludeCount"></span><span class="spacer"></span></div>
            <div id="excludes"></div>
            <div class="actions"><button class="btn" id="addFolder">Add folder…</button><button class="btn" id="addPattern">Add pattern…</button></div>
            <div class="note">Added to the scanner defaults (node_modules, target, dist…). Glob patterns, <code>**</code> at any depth, <code>path:</code> prefix for a sub-project. Needs scanner 6.23 or later.</div>
            <div class="head"><span class="title">Scanner options</span><span class="count" id="optionCount"></span><span class="spacer"></span></div>
            <div id="options"></div>
            <div class="acwrap">
                <div class="acrow"><input id="optInput" type="text" spellcheck="false" autocomplete="off" placeholder="--option=value  (type -- to see them)" aria-label="Scanner option to add" aria-autocomplete="list" aria-controls="ac" /><button class="btn" id="addOption" disabled>Add</button></div>
                <div class="ac" id="ac" role="listbox"></div>
            </div>
            <div class="hint" id="optHint"></div>
            <div class="note">Passed to <code>xygeni scan</code> in the full scan and on save. Only the options the IDE can pass are accepted; the ones the plugin sets itself (<code>--run</code>, <code>-o</code>, excludes…) are refused.</div>
            <div class="foot"><span id="fileNote"></span><span class="spacer"></span><a id="openFile">Open file</a><a id="restore">Restore defaults</a></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const scannerCount = ${scannerCount};
        const onSaveCount = ${onSaveCount};
        const SCAN_OPTIONS = ${asJs(scanOptions)};
        const MANAGED_OPTIONS = ${asJs(managedOptions)};
        const post = (message) => vscode.postMessage(message);
        const byId = (id) => document.getElementById(id);
        const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const saved = vscode.getState() || {};
        // Which blocks the user opened or closed by hand; the others follow the state (Connection opens while it is not ready).
        const manual = saved.manual || {};
        function setOpen(block, open) { byId('blk-' + block).classList.toggle('open', open); }
        document.querySelectorAll('.blockhead').forEach((head) => head.addEventListener('click', () => {
            const block = head.dataset.block; const el = byId('blk-' + block);
            manual[block] = !el.classList.contains('open'); setOpen(block, manual[block]);
            vscode.setState({ ...saved, manual });
        }));
        const click = (id, message) => byId(id).addEventListener('click', (event) => { event.preventDefault(); post(message); });
        click('editUrl', { type: 'editUrl' }); click('editToken', { type: 'editToken' }); click('upgrade', { type: 'upgrade' });
        click('settings', { type: 'settings' }); click('mcpSetup', { type: 'mcpSetup' }); click('mcpCheck', { type: 'mcpCheck' });
        click('runScan', { type: 'runScan' }); click('scanOutput', { type: 'scanOutput' });
        click('selectAll', { type: 'selectAll' }); click('clear', { type: 'clear' }); click('restore', { type: 'restoreDefaults' });
        click('openFile', { type: 'openFile' }); click('addFolder', { type: 'addFolder' }); click('addPattern', { type: 'addPattern' });
        let cliMessage = { type: 'connect' };
        byId('cliAction').addEventListener('click', (event) => { event.preventDefault(); post(cliMessage); });
        document.querySelectorAll('input[data-switch]').forEach((input) => input.addEventListener('change', () => {
            const kind = input.dataset.switch;
            if (kind === 'autoScan') { post({ type: 'toggleAutoScan' }); }
            else if (kind === 'option') { post({ type: 'toggleOption', setting: input.dataset.key }); }
            else { post({ type: kind === 'scan' ? 'toggleScan' : 'toggleOnSave', key: input.dataset.key, enabled: input.checked }); }
        }));

        function renderConnection(c) {
            const ready = c.connectionReady && c.installReady;
            setOpen('connection', manual.connection !== undefined ? manual.connection : !ready);
            byId('editUrl').textContent = c.url || 'Not configured';
            byId('editToken').textContent = c.hasToken ? '••••••••••••' : 'Not configured';
            let text, dot;
            if (!c.configValid) { text = 'Configure the URL and token'; dot = 'err'; cliMessage = { type: 'editUrl' }; }
            else if (c.connecting || !c.checked) { text = 'Connecting…'; dot = 'busy'; cliMessage = { type: 'connect' }; }
            else if (!c.connectionReady) { text = 'Disconnected. Click to connect'; dot = 'err'; cliMessage = { type: 'connect' }; }
            else if (c.installing) { text = 'Installing scanner…'; dot = 'busy'; cliMessage = { type: 'connect' }; }
            else if (c.installError) { text = 'Installation failed. Click to retry'; dot = 'err'; cliMessage = { type: 'install' }; }
            else if (c.installReady) { text = 'Ready to scan. Click to reinstall'; dot = 'ok'; cliMessage = { type: 'reinstall' }; }
            else { text = 'Click to install the scanner'; dot = 'ok'; cliMessage = { type: 'install' }; }
            byId('cliAction').textContent = text; byId('cliDot').className = 'dot ' + dot;
            const licDot = byId('licDot'), licText = byId('licText'), upgrade = byId('upgrade');
            if (!c.connectionReady) { licDot.className = 'dot'; licText.textContent = 'Unknown'; upgrade.style.display = 'none'; }
            else if (!c.licenseAvailable) { licDot.className = 'dot err'; licText.textContent = 'IDE licence not available. Contact your administrator'; upgrade.style.display = 'none'; }
            else if (c.licenseFree) { licDot.className = 'dot ok'; licText.textContent = 'Free plan'; upgrade.style.display = ''; }
            else { licDot.className = 'dot ok'; licText.textContent = 'Valid'; upgrade.style.display = 'none'; }
            const autoScan = document.querySelector('input[data-switch="autoScan"]');
            autoScan.checked = c.autoScan; autoScan.disabled = c.licenseFree;
            byId('autoScanDesc').textContent = c.licenseFree ? 'Not available on the Free plan' : 'Runs the on-save scan types when a file is saved';
            byId('options').innerHTML = c.options.filter((o) => o.enabled || o.alwaysVisible).map((o) =>
                '<div class="trow"><div class="text"><div>' + esc(o.label) + '</div><div class="desc">' + esc(o.option) + (o.setting === 'skipSslVerify' ? ' · only for corporate TLS proxies' : '') + '</div></div>'
                + '<label class="sw"><input type="checkbox" role="switch" data-switch="option" data-key="' + esc(o.setting) + '" aria-label="' + esc(o.label) + '"' + (o.enabled ? ' checked' : '') + ' /><span class="track"></span></label></div>').join('');
            byId('options').querySelectorAll('input[data-switch]').forEach((input) => input.addEventListener('change', () => post({ type: 'toggleOption', setting: input.dataset.key })));
            const m = c.mcp;
            byId('mcpDot').className = 'dot ' + (m.installed ? (m.updateAvailable ? 'busy' : 'ok') : '');
            byId('mcpText').textContent = !m.installed ? 'Not installed yet'
                : (m.installedVersion ? m.installedVersion : 'Installed') + (m.updateAvailable ? ' → ' + m.availableVersion + ' available' : m.updateAvailable === false ? ' · up to date' : '');
            byId('mcpText').title = (m.path || '') + ' · updates: ' + m.updateMode;
            byId('mcpSetup').style.display = m.installed ? '' : 'none'; byId('mcpCheck').style.display = m.installed ? '' : 'none';
            byId('connSub').textContent = ready ? (c.url + ' · ready') : (c.configValid ? text : 'not configured');
        }
        function renderScan(s, canScan) {
            const run = byId('runScan'); run.disabled = s.running || !canScan; run.textContent = s.running ? '⟳ Scanning…' : '▶ Run scan';
            byId('chips').innerHTML = s.counts.map((e) => '<button class="chip' + (e.count === 0 ? ' zero' : '') + (e.inFullScan ? '' : ' off') + '" data-view="' + esc(e.view) + '" title="' + esc(e.inFullScan ? 'Open ' + e.label : e.label + ' is not in the full scan') + '"><span class="n">' + e.count + '</span>' + esc(e.label) + '</button>').join('');
            byId('chips').querySelectorAll('button[data-view]').forEach((b) => b.addEventListener('click', () => post({ type: 'focusView', view: b.dataset.view })));
            byId('hist').innerHTML = s.history.length === 0 ? '<div class="note">No scan yet.</div>' : s.history.map((h) =>
                '<div class="hrow"><span class="dot ' + (h.status === 'completed' ? 'ok' : h.status === 'running' ? 'busy' : h.status === 'failed' ? 'err' : '') + '"></span><span class="t">' + esc(h.time) + '</span><span class="s" title="' + esc(h.summary) + '">' + esc(h.summary || h.status) + '</span></div>').join('');
            byId('scanSub').textContent = s.running ? 'scanning…' : (s.history.length ? s.total + ' findings' : '');
        }
        // ── Scanner options: a command-line-like input with autocompletion and validation (the host validates again) ──
        const optInput = byId('optInput'), ac = byId('ac'), optHint = byId('optHint'), addOptionBtn = byId('addOption');
        let acItems = [], acIndex = -1;
        function parseOpt(text) {
            const m = /^\\s*(-{1,2}[A-Za-z][\\w-]*)(?:\\s*=\\s*|\\s+)?(.*)$/s.exec(text);
            return m ? { name: m[1], value: m[2].trim(), sep: text.indexOf('=') >= 0 || /\\s/.test(text.trim()) } : null;
        }
        function checkOpt(text) {
            const t = text.trim();
            if (!t) { return { ok: false, error: '' }; }
            const p = parseOpt(t);
            if (!p) { return { ok: false, error: 'An option starts with --' }; }
            if (MANAGED_OPTIONS[p.name]) { return { ok: false, error: p.name + ' is not available here: ' + MANAGED_OPTIONS[p.name] }; }
            const spec = SCAN_OPTIONS.find((o) => o.name === p.name);
            if (!spec) { return { ok: false, error: p.name + ' is not an option the IDE can pass to the scanner' }; }
            if (spec.kind === 'flag') { return p.value ? { ok: false, error: spec.name + ' takes no value' } : { ok: true, spec }; }
            if (!p.value) { return { ok: false, pending: true, error: spec.name + ' needs a value' + (spec.placeholder ? ', like ' + spec.placeholder : ''), spec }; }
            if (spec.kind === 'enum' && !spec.values.includes(p.value)) { return { ok: false, error: spec.name + ' is one of ' + spec.values.join(', '), spec }; }
            if (spec.kind === 'list') {
                const items = p.value.split(',').map((s) => s.trim());
                if (items.some((s) => !s)) { return { ok: false, error: spec.name + ': comma-separated values, none empty', spec }; }
                if (spec.closed) { const bad = items.filter((s) => !spec.values.includes(s)); if (bad.length) { return { ok: false, error: spec.name + ': ' + bad.join(', ') + ' not among ' + spec.values.join(', '), spec }; } }
            }
            return { ok: true, spec };
        }
        function suggestions(text) {
            const t = text.replace(/^\\s+/, '');
            const p = parseOpt(t);
            if (!p || !p.sep) {
                const prefix = (p ? p.name : t).toLowerCase();
                return SCAN_OPTIONS.filter((o) => o.name.startsWith(prefix) || prefix === '' || prefix === '-')
                    .map((o) => ({ label: o.name, detail: o.description, insert: o.kind === 'flag' ? o.name : o.name + '=' }));
            }
            const spec = SCAN_OPTIONS.find((o) => o.name === p.name);
            if (!spec || !spec.values) { return []; }
            const items = p.value.split(','); const last = items.pop().trim().toLowerCase(); const head = items.map((s) => s.trim()).filter(Boolean);
            const base = spec.name + '=' + (head.length ? head.join(',') + ',' : '');
            return spec.values.filter((v) => v.startsWith(last) && !head.includes(v)).map((v) => ({ label: v, detail: spec.kind === 'enum' ? '' : 'comma-separated', insert: base + v }));
        }
        function showAc(list) {
            acItems = list; acIndex = list.length ? 0 : -1;
            ac.innerHTML = list.map((s, i) => '<div class="it' + (i === acIndex ? ' sel' : '') + '" role="option" data-i="' + i + '"><span class="nm">' + esc(s.label) + '</span><span class="ds">' + esc(s.detail || '') + '</span></div>').join('');
            ac.classList.toggle('open', list.length > 0);
            ac.querySelectorAll('.it').forEach((el) => el.addEventListener('mousedown', (e) => { e.preventDefault(); accept(Number(el.dataset.i)); }));
        }
        function hideAc() { ac.classList.remove('open'); acItems = []; acIndex = -1; }
        function accept(i) {
            const s = acItems[i]; if (!s) { return; }
            optInput.value = s.insert; optInput.focus(); refreshOpt(true);
        }
        function refreshOpt(suggest) {
            const text = optInput.value; const r = checkOpt(text);
            optInput.classList.toggle('bad', !!r.error && !r.pending); optInput.classList.toggle('good', r.ok);
            optHint.textContent = r.ok ? (r.spec ? r.spec.description : '') : (r.error || (r.spec && r.spec.description) || '');
            if (!r.ok && !r.error && text.trim()) { optHint.textContent = ''; }
            optHint.classList.toggle('err', !!r.error && !r.pending);
            addOptionBtn.disabled = !r.ok;
            if (suggest) { showAc(suggestions(text)); } else { hideAc(); }
        }
        function submitOpt() {
            if (ac.classList.contains('open') && acIndex >= 0 && !checkOpt(optInput.value).ok) { accept(acIndex); return; }
            const r = checkOpt(optInput.value);
            if (!r.ok) { refreshOpt(true); return; }
            addOptionBtn.disabled = true; post({ type: 'addOption', text: optInput.value.trim() });
        }
        optInput.addEventListener('input', () => refreshOpt(true));
        optInput.addEventListener('focus', () => refreshOpt(true));
        optInput.addEventListener('blur', () => setTimeout(hideAc, 120));
        optInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!ac.classList.contains('open')) { showAc(suggestions(optInput.value)); }
                if (acItems.length) { acIndex = (acIndex + (e.key === 'ArrowDown' ? 1 : acItems.length - 1)) % acItems.length; ac.querySelectorAll('.it').forEach((el, i) => el.classList.toggle('sel', i === acIndex)); ac.querySelector('.it.sel')?.scrollIntoView({ block: 'nearest' }); }
                e.preventDefault();
            } else if (e.key === 'Tab' && ac.classList.contains('open') && acIndex >= 0) { accept(acIndex); e.preventDefault(); }
            else if (e.key === 'Enter') { submitOpt(); e.preventDefault(); }
            else if (e.key === 'Escape') { hideAc(); }
        });
        addOptionBtn.addEventListener('click', submitOpt);
        window.addEventListener('message', (event) => {
            const m = event.data || {};
            if (m.type === 'optionError') { optHint.textContent = m.error; optHint.classList.add('err'); optInput.classList.add('bad'); optInput.classList.remove('good'); }
            if (m.type === 'optionAdded') { optInput.value = ''; refreshOpt(false); }
        });
        function renderOptions(config) {
            const names = (o) => { const p = parseOpt(o); return p ? p : { name: o, value: '' }; };
            byId('options').innerHTML = config.options.length === 0 ? '<div class="note">None: the scanner defaults apply.</div>'
                : config.options.map((o) => { const p = names(o); const spec = SCAN_OPTIONS.find((s) => s.name === p.name);
                    return '<div class="ex" title="' + esc(spec ? spec.description : '') + '"><span class="name">' + esc(p.name) + '</span><span class="val">' + (p.value ? '=' + esc(p.value) : '') + '</span><button data-name="' + esc(p.name) + '" title="Remove" aria-label="Remove ' + esc(p.name) + '">✕</button></div>'; }).join('');
            byId('options').querySelectorAll('button[data-name]').forEach((b) => b.addEventListener('click', () => post({ type: 'removeOption', name: b.dataset.name })));
            byId('optionCount').textContent = String(config.options.length);
        }

        function renderScanConfig(sc, autoScan) {
            const config = sc.config;
            renderOptions(config);
            document.querySelectorAll('input[data-switch="scan"]').forEach((input) => { input.checked = config.scans.includes(input.dataset.key); });
            document.querySelectorAll('input[data-switch="onSave"]').forEach((input) => {
                const inFull = config.scans.includes(input.dataset.key);
                input.checked = config.onSave.includes(input.dataset.key); input.disabled = !inFull;
                input.parentElement.classList.toggle('dim', !autoScan && inFull);
                input.parentElement.title = !inFull ? 'Runs on save only while it is in the full scan' : autoScan ? 'On save' : 'Auto Scan on Save is off: switching this on turns it on';
            });
            const switched = config.scans.filter((type) => type !== 'suspectdeps').length;
            byId('cfgSub').textContent = switched + '/' + scannerCount + ' scanners · ' + config.onSave.length + '/' + onSaveCount + ' on save' + (config.excludes.length ? ' · ' + config.excludes.length + ' excluded' : '') + (config.options.length ? ' · ' + config.options.length + ' option' + (config.options.length > 1 ? 's' : '') : '');
            byId('scanNote').textContent = config.onSave.length === 0 ? 'Nothing runs on save: Auto Scan on Save is skipped until a type is switched on.' : '';
            const excludes = byId('excludes');
            excludes.innerHTML = config.excludes.length === 0 ? '<div class="note">None: the scanner defaults apply.</div>'
                : config.excludes.map((p) => '<div class="ex"><span class="pat" title="' + esc(p) + '">' + esc(p) + '</span><button data-pattern="' + esc(p) + '" title="Stop excluding" aria-label="Stop excluding ' + esc(p) + '">✕</button></div>').join('');
            excludes.querySelectorAll('button[data-pattern]').forEach((b) => b.addEventListener('click', () => post({ type: 'removeExclude', pattern: b.dataset.pattern })));
            byId('excludeCount').textContent = String(config.excludes.length);
            byId('fileNote').textContent = sc.isDefault ? 'Defaults, nothing written. Shared by the Xygeni IDE plugins in .xygeni/ide.json' : 'Saved in .xygeni/ide.json, shared by the Xygeni IDE plugins';
        }
        function render(state) {
            renderConnection(state.connection);
            const canScan = state.connection.installReady && state.connection.licenseAvailable;
            renderScan(state.scan, canScan);
            renderScanConfig(state.scanConfig, state.connection.autoScan);
            setOpen('scan', manual.scan !== undefined ? manual.scan : canScan);
            setOpen('scanconfig', manual.scanconfig !== undefined ? manual.scanconfig : false);
        }
        window.addEventListener('message', (event) => { if (event.data && event.data.type === 'state') { render(event.data.state); } });
        post({ type: 'ready' });
    </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
