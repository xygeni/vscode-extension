import * as vscode from 'vscode';
import { ConfigManager } from '../config/xygeni-configuration';
import { COMMAND_EDIT_XYGENI_API_URL, COMMAND_INSTALL_SCANNER, COMMAND_OPEN_SCAN_CONFIG_FILE, COMMAND_REMOVE_EXCLUDE, COMMAND_RESTORE_SCAN_DEFAULTS, COMMAND_SHOW_MCP_SETUP, COMMAND_TEST_XYGENI_CONNECTION, COMMAND_TOGGLE_AUTO_SCAN, COMMAND_TOGGLE_GLOBAL_OPTION, COMMAND_UPGRADE_LICENSE, STATUS, XYGENI_CONTEXT } from '../common/constants';
import { Commands, XyContext } from '../common/interfaces';
import { GLOBAL_OPTION_TOGGLES } from '../service/scanner-options';
import { ON_SAVE_SCANNERS, SCAN_CONFIG_DIR, SCAN_CONFIG_FILE, SWITCHABLE_SCANNERS, ScanConfig, ScanType, ScannerOption, isDefaultScanConfig } from '../service/scan-config';


export interface ConfigurationViewEmitter {
    refreshConfigEventEmitter: vscode.Event<void>;
    /** The per-project scan configuration (#415). */
    getScanConfig(): ScanConfig;
    getScanConfigPath(): string | undefined;
}

/** What a checkbox row of the Scan configuration section switches. */
export interface ScanTypeToggle {
    type: ScanType;
    onSave: boolean;
}

const SCAN_CONFIG_SECTION = 'scan-config';
/** The same configuration as a tree section with checkboxes; off since the webview view (ScanConfigView) replaced it. */
const SHOW_SCAN_CONFIG_IN_TREE = false;
const SCAN_CONFIG_FULL = 'scan-config-full';
const SCAN_CONFIG_ON_SAVE = 'scan-config-on-save';
const SCAN_CONFIG_EXCLUDES = 'scan-config-excludes';

export default class ConfigurationView implements vscode.TreeDataProvider<ConfigItem> {

    private readonly CLI_STATUS_ITEM_LABEL = '  CLI Status => ';
    private readonly MCP_SETUP_ITEM_LABEL = '  MCP Setup => ';

    private _onDidChangeTreeData: vscode.EventEmitter<ConfigItem | undefined> = new vscode.EventEmitter<ConfigItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ConfigItem | undefined> = this._onDidChangeTreeData.event;

    constructor(
        private context: vscode.ExtensionContext,
        private xygeniContext: XyContext,
        private commands: ConfigurationViewEmitter
    ) {
        this.commands.refreshConfigEventEmitter(() => this._onDidChangeTreeData.fire(undefined));
        // Scan Settings can also be changed from the Settings editor.
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('xygeni.scan')) { this._onDidChangeTreeData.fire(undefined); }
        }));
    }

    configItems: ConfigItem[] = [];


    getTreeItem(element: ConfigItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConfigItem): Promise<ConfigItem[]> {
        if (!element) {
            // Root level - show configuration items
            const xygeniUrl = ConfigManager.getXygeniUrl();
            const xygeniToken = await ConfigManager.getXygeniToken(this.context);
            const isLicenseIdeAvailable = this.xygeniContext.getKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE);
            const isConfigValid = await ConfigManager.isConfigValid(this.context);
            const isConnectionValid = !!this.xygeniContext.getKey(XYGENI_CONTEXT.CONNECTION_READY);
            const isXygeniInstalled = !!this.xygeniContext.getKey(XYGENI_CONTEXT.INSTALL_READY);
            const isConnecting = !!this.xygeniContext.getKey(XYGENI_CONTEXT.CONNECTING);
            const isInstalling = !!this.xygeniContext.getKey(XYGENI_CONTEXT.INSTALLING);
            const isMcpLibraryInstalled = !!this.xygeniContext.getKey(XYGENI_CONTEXT.MCP_LIBRARY_INSTALLED);
            const isLicenseFree = !!this.xygeniContext.getKey(XYGENI_CONTEXT.LICENSE_FREE);
            const overrideInstallation = true;

            this.configItems = [
                // Xygeni API Url field
                new ConfigItem(
                    'Xygeni URL',
                    xygeniUrl || 'Not configured',
                    vscode.TreeItemCollapsibleState.None,
                    'url',
                    {
                        command: COMMAND_EDIT_XYGENI_API_URL,
                        title: 'Edit Xygeni API URL',
                        arguments: [xygeniUrl]
                    }
                ),
                // Authentication Token
                new ConfigItem(
                    'Authentication Token',
                    xygeniToken ? '••••••••••••••••' : 'Not configured',
                    vscode.TreeItemCollapsibleState.None,
                    'token',
                    {
                        command: 'xygeni.config.editToken',
                        title: 'Update Token',
                        arguments: []
                    }
                ),
                // CLI Status (connection + scanner installation)
                new ConfigItem(
                    this.CLI_STATUS_ITEM_LABEL,
                    this.getCliStatusDescription(isConfigValid, isConnecting, isConnectionValid, isInstalling, isXygeniInstalled),
                    vscode.TreeItemCollapsibleState.None,
                    this.getCliStatusIcon(isConfigValid, isConnecting, isConnectionValid, isInstalling, isXygeniInstalled),
                    {
                        command: isXygeniInstalled ? COMMAND_TEST_XYGENI_CONNECTION : isConnectionValid ? COMMAND_INSTALL_SCANNER : COMMAND_TEST_XYGENI_CONNECTION,
                        title: isConnectionValid ? 'Install Scanner' : 'Refresh Connection',
                        arguments: isXygeniInstalled ? [overrideInstallation] : []
                    },
                ),
            ];

            // Auto Scan on Save runs the scanner with `--incremental`, which the Xygeni Free
            // edition rejects. On a Free license, show the item disabled with an upgrade prompt
            // that opens the pricing page; otherwise show the normal enable/disable toggle.
            if (isLicenseFree) {
                this.configItems.push(
                    new ConfigItem(
                        '  Auto Scan on Save',
                        'Disabled on Free plan. Click to Upgrade.',
                        vscode.TreeItemCollapsibleState.None,
                        'status-locked',
                        {
                            command: COMMAND_UPGRADE_LICENSE,
                            title: 'Upgrade your Xygeni plan',
                            arguments: []
                        }
                    )
                );
            } else {
                this.configItems.push(
                    new ConfigItem(
                        '  Auto Scan on Save',
                        ConfigManager.getAutoScan() ? 'Enabled' : 'Disabled. Click to Enable.',
                        vscode.TreeItemCollapsibleState.None,
                        ConfigManager.getAutoScan() ? 'status-ok' : 'status-unknown',
                        {
                            command: COMMAND_TOGGLE_AUTO_SCAN,
                            title: 'Toggle Run Increment Scans on File Save',
                            arguments: []
                        }
                    )
                );
            }

            // Scanner global options: Skip SSL Verification is always offered (the corporate TLS proxy case);
            // the others show up only while they are on, so what changes the scanner is visible and one
            // click away from being turned off. All of them are checkboxes in the Settings (gear icon).
            for (const toggle of GLOBAL_OPTION_TOGGLES) {
                const enabled = ConfigManager.getScanFlag(toggle.setting);
                if (!enabled && !toggle.alwaysVisible) { continue; }
                const item = new ConfigItem(
                    `  ${toggle.label}`,
                    enabled ? `Enabled (${toggle.option}). Click to Disable.` : 'Disabled. Click to Enable.',
                    vscode.TreeItemCollapsibleState.None,
                    enabled ? 'option-on' : 'option-off',
                    {
                        command: COMMAND_TOGGLE_GLOBAL_OPTION,
                        title: `Toggle ${toggle.option}`,
                        arguments: [toggle.setting]
                    }
                );
                item.tooltip = `Runs the scanner with ${toggle.option}. More scanner options in the Settings (gear icon).`;
                this.configItems.push(item);
            }

            if (!isLicenseIdeAvailable) {
                this.configItems.push(
                    new ConfigItem(
                        'Ide License Not Available.',
                        'Max Xygeni Ide Licenses reached. Contact administrator to increase limit.',
                        vscode.TreeItemCollapsibleState.None,
                        'status-error'
                    )
                );
            }

            if (isMcpLibraryInstalled) {
                this.configItems.push(
                    // Install Scanner
                    new ConfigItem(
                        this.MCP_SETUP_ITEM_LABEL,
                        'Click to Setup Xygeni MCP Server',
                        vscode.TreeItemCollapsibleState.None,
                        'status-unknown',
                        {
                            command: COMMAND_SHOW_MCP_SETUP,
                            title: 'Guide for Install Xygeni MCP Server',
                            arguments: []
                        }
                    )
                );
            }

            // Per-project scan configuration (#415): which scan types run, in the full scan and on save.
            if (SHOW_SCAN_CONFIG_IN_TREE && isXygeniInstalled) {
                this.configItems.push(this.scanConfigSection());
            }

            return this.configItems;
        }
        if (element.contextValue === SCAN_CONFIG_SECTION) {
            return this.scanConfigChildren();
        }
        if (element.contextValue === SCAN_CONFIG_FULL) {
            return SWITCHABLE_SCANNERS.map(scanner => this.scannerRow(scanner, false));
        }
        if (element.contextValue === SCAN_CONFIG_ON_SAVE) {
            return ON_SAVE_SCANNERS.map(scanner => this.scannerRow(scanner, true));
        }
        if (element.contextValue === SCAN_CONFIG_EXCLUDES) {
            return this.excludeRows();
        }
        return [];
    }

    /** The toggle behind a checkbox row, or undefined for any other item. */
    checkboxToggle(item: ConfigItem): ScanTypeToggle | undefined {
        return item.scanTypeToggle;
    }

    private scanConfigSection(): ConfigItem {
        const config = this.commands.getScanConfig();
        const section = new ConfigItem(
            'Scan configuration',
            `${config.scans.filter(type => type !== 'suspectdeps').length}/${SWITCHABLE_SCANNERS.length} scanners · ${config.onSave.length} on save`,
            vscode.TreeItemCollapsibleState.Collapsed,
            SCAN_CONFIG_SECTION
        );
        section.iconPath = new vscode.ThemeIcon('settings');
        section.tooltip = `Which scan types run in this project. Saved in ${SCAN_CONFIG_DIR}/${SCAN_CONFIG_FILE} at the workspace root, `
            + 'shared with the other Xygeni IDE plugins; commit it to share it with your team.';
        return section;
    }

    private scanConfigChildren(): ConfigItem[] {
        const config = this.commands.getScanConfig();
        const full = new ConfigItem(
            'Full scan',
            `${config.scans.filter(type => type !== 'suspectdeps').length}/${SWITCHABLE_SCANNERS.length}`,
            vscode.TreeItemCollapsibleState.Expanded,
            SCAN_CONFIG_FULL
        );
        full.iconPath = new vscode.ThemeIcon('play');
        full.tooltip = 'The scan types of Run Scanner. With SCA on, suspect dependencies also run. At least one is required.';

        const onSave = new ConfigItem(
            'On save',
            `${config.onSave.length}/${ON_SAVE_SCANNERS.length}`,
            vscode.TreeItemCollapsibleState.Expanded,
            SCAN_CONFIG_ON_SAVE
        );
        onSave.iconPath = new vscode.ThemeIcon('save');
        onSave.tooltip = 'The scan types of Auto Scan on Save. Only the scan types that can analyze just the changed files are '
            + 'offered; the others would scan the whole project on every save. A type must be in the full scan to run on save.';

        const excludes = new ConfigItem(
            'Excluded folders',
            `${config.excludes.length}`,
            config.excludes.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
            SCAN_CONFIG_EXCLUDES
        );
        excludes.iconPath = new vscode.ThemeIcon('folder');
        excludes.tooltip = 'Folders and patterns excluded from every scan, added to the scanner defaults (node_modules, target, '
            + 'dist…). Glob patterns: * file wildcard, ** any depth, "path:" prefix for a sub-project. Needs scanner 6.23 or later.';

        const file = new ConfigItem(
            isDefaultScanConfig(config) ? 'Defaults' : `${SCAN_CONFIG_DIR}/${SCAN_CONFIG_FILE}`,
            isDefaultScanConfig(config) ? 'Nothing written yet. Click to edit the file.' : 'Click to open. Restore defaults with the icon.',
            vscode.TreeItemCollapsibleState.None,
            isDefaultScanConfig(config) ? 'scan-config-defaults' : 'scan-config-file',
            { command: COMMAND_OPEN_SCAN_CONFIG_FILE, title: 'Open the scan configuration file', arguments: [] }
        );
        file.iconPath = new vscode.ThemeIcon('json');
        return [full, onSave, excludes, file];
    }

    private excludeRows(): ConfigItem[] {
        const config = this.commands.getScanConfig();
        if (config.excludes.length === 0) {
            const none = new ConfigItem('None', 'Use the folder or + icon to add one', vscode.TreeItemCollapsibleState.None, 'scan-exclude-none');
            none.iconPath = new vscode.ThemeIcon('info');
            return [none];
        }
        return config.excludes.map(pattern => {
            const row = new ConfigItem(pattern, '', vscode.TreeItemCollapsibleState.None, 'scan-exclude',
                { command: COMMAND_REMOVE_EXCLUDE, title: 'Stop excluding', arguments: [pattern] });
            row.iconPath = new vscode.ThemeIcon(/^[^*?]+\/\*\*$/.test(pattern) ? 'folder' : 'regex');
            row.tooltip = `${pattern}: click to stop excluding it`;
            return row;
        });
    }

    private scannerRow(scanner: ScannerOption, onSave: boolean): ConfigItem {
        const config = this.commands.getScanConfig();
        const inFullScan = config.scans.includes(scanner.key);
        const checked = onSave ? config.onSave.includes(scanner.key) : inFullScan;
        const row = new ConfigItem(scanner.label, scanner.description, vscode.TreeItemCollapsibleState.None, 'scan-type');
        row.iconPath = new vscode.ThemeIcon(scanner.icon);
        row.checkboxState = checked ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
        row.scanTypeToggle = { type: scanner.key, onSave };
        if (onSave && !inFullScan) {
            row.description = 'Not in the full scan';
            row.tooltip = `${scanner.label} runs on save only while it is in the full scan.`;
        } else {
            row.tooltip = `${scanner.label}: ${scanner.description}`;
        }
        return row;
    }



    private getCliStatusDescription(
        isConfigValid: boolean, isConnecting: boolean, isConnectionValid: boolean,
        isInstalling: boolean, isXygeniInstalled: boolean
    ): string {
        if (!isConfigValid) { return 'Not configured'; }
        if (isConnecting) { return 'Connecting...'; }
        if (!isConnectionValid) { return 'Disconnected. Click to reconnect'; }
        if (isInstalling) { return 'Installing scanner...'; }
        if (isXygeniInstalled) { return 'Ready to Scan. Click to reinstall.'; }
        return 'Click to Install Xygeni Scanner';
    }

    private getCliStatusIcon(
        isConfigValid: boolean, isConnecting: boolean, isConnectionValid: boolean,
        isInstalling: boolean, isXygeniInstalled: boolean
    ): string {
        if (!isConfigValid) { return 'status-error'; }
        if (isConnecting || isInstalling) { return 'status-loading'; }
        if (isXygeniInstalled) { return 'status-ok'; }
        if (isConnectionValid) { return 'status-unknown'; }
        return 'status-unknown';
    }

    private getContextValueFromStatus(status: string): string {
        switch (status) {
            case STATUS.OK:
                return 'status-ok';
            case STATUS.ERROR:
                return 'status-error';
            case STATUS.RUNNING:
                return 'status-loading';
            case STATUS.UNKNOWN:
                return 'status-unknown';
            default:
                return 'status-unknown';
        }
    }

    getCliStatusItem(): ConfigItem | undefined {
        return this.configItems.find(item => item.label === this.CLI_STATUS_ITEM_LABEL);
    }


    dispose() {
        this._onDidChangeTreeData.dispose();
    }

}

class ConfigItem extends vscode.TreeItem {
    public value: string;
    public contextValue: string;
    public lastRefreshTime?: Date;
    /** Set on the checkbox rows of the Scan configuration section (#415). */
    public scanTypeToggle?: ScanTypeToggle;

    constructor(
        public readonly label: string,
        value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue: string,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState);

        this.value = value;
        this.contextValue = contextValue;
        this.tooltip = `${this.label}: ${this.value}`;
        this.description = this.value;

        this.updateIcon();
    }

    private updateIcon(): void {
        switch (this.contextValue) {
            case 'url':
                this.iconPath = new vscode.ThemeIcon('globe');
                break;
            case 'token':
                this.iconPath = new vscode.ThemeIcon('key');
                break;
            case 'status-ok':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'status-error':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconFailed'));
                break;
            case 'status-loading':
                this.iconPath = new vscode.ThemeIcon('loading~spin');
                break;
            case 'status-unknown':
                this.iconPath = new vscode.ThemeIcon('question');
                break;
            case 'status-locked':
                this.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.yellow'));
                break;
            case 'option-off':
                this.iconPath = new vscode.ThemeIcon('shield');
                break;
            case 'option-on':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
                break;
            case 'show':
                this.iconPath = new vscode.ThemeIcon('eye');
                break;
        }
    }


}

