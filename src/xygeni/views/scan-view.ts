import * as vscode from 'vscode';
import { Commands, ScanResult } from '../common/interfaces';


export class ScanView implements vscode.TreeDataProvider<ScanResultItem> {
    public static readonly viewType = 'xygeni.views.scan';

    private _onDidChangeTreeData: vscode.EventEmitter<ScanResultItem | undefined> = new vscode.EventEmitter<ScanResultItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ScanResultItem | undefined> = this._onDidChangeTreeData.event;


    constructor(private readonly _context: vscode.ExtensionContext,
        private commands: Commands
    ) {
        this.commands.refreshScannerEventEmitter(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ScanResultItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: any): vscode.ProviderResult<ScanResultItem[]> {
        if (!element) {
            const results = this.commands.getScans();
            if (results.length > 0) {
                return results.map(result => new ScanResultItem(result, vscode.TreeItemCollapsibleState.None));
            }
            else {
                return [
                    new ScanResultItem(
                        {
                            timestamp: new Date(),
                            status: 'not-executed',
                            issuesFound: 0,
                            summary: 'Click play to run an scan'
                        },
                        vscode.TreeItemCollapsibleState.None
                    )
                ];
            }

        }
    }

}

export class ScanResultItem extends vscode.TreeItem {
    constructor(
        public readonly result: ScanResult,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(`Scan ${result.timestamp.toLocaleString()}`, collapsibleState);

        this.tooltip = result.summary;
        this.description = `${result.status}`;
        if (result.issuesFound !== undefined) { this.description += ` - ${result.issuesFound + ' issues'}`; }

        // Set icon based on status
        switch (result.status) {
            case 'completed':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'running':
                this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('foreground'));
                break;
            case 'failed':
                this.iconPath = new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
                break;
        }
    }
}
