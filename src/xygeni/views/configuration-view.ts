import * as vscode from 'vscode';
import { ConfigManager } from '../config/xygeni-configuration';
import { COMMAND_EDIT_XYGENI_API_URL, COMMAND_INSTALL_SCANNER, COMMAND_TEST_XYGENI_CONNECTION, CONFIG_XYGENI_API_URL, STATUS, XYGENI_CONTEXT } from '../common/constants';
import { Commands, XyContext } from '../common/interfaces';


export interface ConfigurationViewEmitter {
    refreshConfigEventEmitter: vscode.Event<void>;
}

export default class ConfigurationView implements vscode.TreeDataProvider<ConfigItem> {

    private readonly CONNECTION_ITEM_LABEL = '  Connection Status => ';
    private readonly INSTALL_ITEM_LABEL = '  Scanner Status => ';

    private _onDidChangeTreeData: vscode.EventEmitter<ConfigItem | undefined> = new vscode.EventEmitter<ConfigItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ConfigItem | undefined> = this._onDidChangeTreeData.event;

    constructor(
        private context: vscode.ExtensionContext,
        private xygeniContext: XyContext,
        private commands: ConfigurationViewEmitter
    ) {
        this.commands.refreshConfigEventEmitter(() => this._onDidChangeTreeData.fire(undefined));
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
            const isConfigValid = await ConfigManager.isConfigValid(this.context);
            const isConnectionValid = this.xygeniContext.getKey(XYGENI_CONTEXT.CONNECTION_READY);
            const isXygeniInstalled = this.xygeniContext.getKey(XYGENI_CONTEXT.INSTALL_READY);
            const isConnecting = this.xygeniContext.getKey(XYGENI_CONTEXT.CONNECTING);
            const isInstalling = this.xygeniContext.getKey(XYGENI_CONTEXT.INSTALLING);

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
                // Connection Status
                new ConfigItem(
                    this.CONNECTION_ITEM_LABEL,
                    isConnecting ? 'Connecting...' : isConnectionValid ? 'Connection Ready' : isConfigValid ? 'Disconnected. Click to reconnect' : 'Not configured',
                    vscode.TreeItemCollapsibleState.None,
                    isConnecting ? 'status-loading' : isConnectionValid ? 'status-ok' : isConfigValid ? 'status-unknown' : 'status-error',
                    {
                        command: COMMAND_TEST_XYGENI_CONNECTION,
                        title: 'Check Connect Status',
                        arguments: [true]
                    },
                )
            ];


            if (this.xygeniContext.getKey(XYGENI_CONTEXT.CONNECTION_READY)) {
                this.configItems.push(
                    // Install Scanner
                    new ConfigItem(
                        this.INSTALL_ITEM_LABEL,
                        isInstalling ? 'Installing...' : isXygeniInstalled ? 'Ready to Scan' : 'Click to Install Xygeni Scanner',
                        vscode.TreeItemCollapsibleState.None,
                        isInstalling ? 'status-loading' : isXygeniInstalled ? 'status-ok' : 'status-unknown',
                        {
                            command: COMMAND_INSTALL_SCANNER,
                            title: 'Install Scan',
                            arguments: []
                        }
                    ),
                    new ConfigItem(
                        '    Show Output Channel',
                        'Click to Open Output',
                        vscode.TreeItemCollapsibleState.None,
                        'show',
                        {
                            command: 'xygeni.showOutput',
                            title: 'Open Extension Output Channel',
                            arguments: [],
                        }
                    )
                );
            }

            return this.configItems;
        }
        return [];
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

    getConnectionStatusItem(): ConfigItem | undefined {
        return this.configItems.find(item => item.label === this.CONNECTION_ITEM_LABEL);
    }
    getInstallStatusItem(): ConfigItem | undefined {
        return this.configItems.find(item => item.label === this.INSTALL_ITEM_LABEL);
    }


    dispose() {
        this._onDidChangeTreeData.dispose();
    }

}

class ConfigItem extends vscode.TreeItem {
    public value: string;
    public contextValue: string;
    public lastRefreshTime?: Date;

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
            case 'show':
                this.iconPath = new vscode.ThemeIcon('eye');
                break;
        }
    }


}

