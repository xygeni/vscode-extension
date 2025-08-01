import * as vscode from 'vscode';
import { Commands, ScanResult } from '../common/interfaces';
import { COMMAND_RUN_SCANNER, COMMAND_SHOW_SCAN_OUTPUT } from '../common/constants';


export class ScanView implements vscode.TreeDataProvider<ScanItem> {
    public static readonly viewType = 'xygeni.views.scan';

    private _onDidChangeTreeData: vscode.EventEmitter<ScanResultItem | undefined> = new vscode.EventEmitter<ScanResultItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ScanResultItem | undefined> = this._onDidChangeTreeData.event;


    constructor(private readonly _context: vscode.ExtensionContext,
        private commands: Commands
    ) {
        this.commands.refreshScannerEventEmitter(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ScanItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: any): vscode.ProviderResult<ScanItem[]> {
        if (!element) {
            const results = this.commands.getScans();
            let children: ScanItem[];
            if (results.length > 0) {
                const resultReversed = [];
                for (let i = results.length - 1; i >= 0; i--) {
                    resultReversed.push(results[i]);
                }
                children = resultReversed.map(result => new ScanResultItem(result, vscode.TreeItemCollapsibleState.None));


            }
            else {
                children = [
                    new CommandItem(
                        'Run Scan',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: COMMAND_RUN_SCANNER,
                            title: 'Run Scan',
                            arguments: []
                        },
                        new vscode.ThemeIcon('play')
                    )
                ];

            }
            children.push(
                new CommandItem(
                    '   Show Scanner Ouput',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: COMMAND_SHOW_SCAN_OUTPUT,
                        title: 'Click to open Scanner Output',
                        arguments: []
                    },
                    new vscode.ThemeIcon('eye')
                )
            );
            return children;
        }

    }

}


export class ScanItem extends vscode.TreeItem {
}

export class ScanResultItem extends ScanItem {


    constructor(
        public readonly result: ScanResult,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(`Scan ${result.timestamp.toLocaleString()}`, collapsibleState);

        this.tooltip = result.status + ' - ' + result.summary;
        this.description = result.summary;
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


export class CommandItem extends ScanItem {
    constructor(
        text: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command,
        iconPath?: vscode.ThemeIcon
    ) {
        super(text, collapsibleState);

        this.tooltip = text;
        this.command = command;
        this.iconPath = iconPath;
    }



}
