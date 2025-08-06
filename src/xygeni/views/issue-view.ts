import * as vscode from 'vscode';
import { XygeniIssue } from '../common/interfaces';

export interface IssueViewEmitter {
    refreshIssuesEventEmitter: vscode.Event<void>;
    getIssuesByCategory(category: string): XygeniIssue[]
    getIconPath(iconname: string): string
}

export abstract class IssueView implements vscode.TreeDataProvider<XygeniTreeItem> {
    public static readonly viewType = 'xygeni.views.issue';

    private _onDidChangeTreeData: vscode.EventEmitter<XygeniTreeItem | undefined> = new vscode.EventEmitter<XygeniTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<XygeniTreeItem | undefined> = this._onDidChangeTreeData.event;


    constructor(protected commands: IssueViewEmitter) {
        this.commands.refreshIssuesEventEmitter(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: XygeniTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: XygeniTreeItem): vscode.ProviderResult<XygeniTreeItem[]> {
        if (!element) {
            // Return category nodes at root level
            return this.getCategoryNodes();
        } else if (element instanceof XygeniCategoryItem) {
            // Return issues for this category
            const allIssues = this.getIssues();
            const categoryIssues = allIssues.filter(issue => issue.category === element.category);

            const map = categoryIssues.map(issue => new XygeniIssueItem(issue, vscode.TreeItemCollapsibleState.None, this.commands));

            return map;
        }
        return [];
    }

    private getCategoryNodes(): XygeniCategoryItem[] {
        const allIssues = this.getIssues();
        const categories: ('iac' | 'sast' | 'sca' | 'secrets' | 'misconf')[] = [this.getCategory()];

        //Logger.log(`Issues by category ${this.getCategory()}: ${allIssues.length}}`);
        return categories.map(category => {
            // this is not required when use separate views 
            const categoryIssues = allIssues.filter(issue => issue.category === category);
            return new XygeniCategoryItem(category, categoryIssues.length, this.commands);
        });
    }

    abstract getIssues(): XygeniIssue[]

    abstract getCategory(): any
}



export class XygeniIssueItem extends vscode.TreeItem {
    constructor(
        public readonly issue: XygeniIssue,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        private commands: IssueViewEmitter
    ) {
        super(issue.type, collapsibleState);

        this.tooltip = issue.explanation;
        this.description = `${issue.severity.toUpperCase()}${issue.file ? ` - ${issue.file}` : ''}`;

        // Set icon based on severity
        switch (issue.severity) {
            case 'critical':
                this.iconPath = this.commands.getIconPath("critical.png");
                break;
            case 'high':
                this.iconPath = this.commands.getIconPath("high.png");
                break;
            case 'medium':
                this.iconPath = this.commands.getIconPath("low.png");
                break;
            case 'low':
                this.iconPath = this.commands.getIconPath("low.png");
                break;
            case 'info':
                this.iconPath = this.commands.getIconPath("info.png");
                break;
        }

        this.command = {
            command: 'xygeni.showIssueDetails',
            title: 'Show Issue Details',
            arguments: [this.issue]
        };

    }
}

export type XygeniTreeItem = XygeniCategoryItem | XygeniIssueItem;

export class XygeniCategoryItem extends vscode.TreeItem {
    constructor(
        public readonly category: 'secrets' | 'misconf' | 'iac' | 'sast' | 'sca',
        public readonly issueCount: number,
        private commands: IssueViewEmitter
    ) {
        const categoryNames = {
            'secrets': 'Secrets',
            'misconf': 'Misconfigurations',
            'iac': 'Infrastructure as Code',
            'sast': 'Static Analysis',
            'sca': 'Dependency Analysis'
        };

        super(categoryNames[category], vscode.TreeItemCollapsibleState.Expanded);

        this.description = `${issueCount} issue${issueCount !== 1 ? 's' : ''}`;
        this.contextValue = 'category';

        // Set icon based on category
        const categoryIcons = {
            'secrets': 'secrets.svg',
            'misconf': 'misconf.svg',
            'iac': 'iacNew.svg',
            'sast': 'code-sec-new.svg',
            'sca': 'open-source.svg'
        };

        this.iconPath = new vscode.ThemeIcon(categoryIcons[category]);

        // Color the count based on whether there are issues
        this.iconPath = this.commands.getIconPath(categoryIcons[category]);
    }
}

export class SastIssueView extends IssueView {
    private category = 'sast';

    constructor(commands: IssueViewEmitter) {
        super(commands);
    }

    getIssues(): XygeniIssue[] {
        return this.commands.getIssuesByCategory(this.category);
    }

    getCategory(): string {
        return this.category;
    }
}

export class ScaIssueView extends IssueView {
    private category = 'sca';

    constructor(commands: IssueViewEmitter) {
        super(commands);
    }

    getIssues(): XygeniIssue[] {
        return this.commands.getIssuesByCategory(this.category);
    }

    getCategory(): string {
        return this.category;
    }
}

export class MisconfIssueView extends IssueView {
    private category = 'misconf';

    constructor(commands: IssueViewEmitter) {
        super(commands);
    }

    getIssues(): XygeniIssue[] {
        return this.commands.getIssuesByCategory(this.category);
    }

    getCategory(): string {
        return this.category;
    }
}

export class SecretsIssueView extends IssueView {
    private category = 'secrets';

    constructor(commands: IssueViewEmitter) {
        super(commands);
    }

    getIssues(): XygeniIssue[] {
        return this.commands.getIssuesByCategory(this.category);
    }

    getCategory(): string {
        return this.category;
    }
}

export class IaCIssueView extends IssueView {
    private category = 'iac';

    constructor(commands: IssueViewEmitter) {
        super(commands);
    }

    getIssues(): XygeniIssue[] {
        return this.commands.getIssuesByCategory(this.category);
    }

    getCategory(): string {
        return this.category;
    }
}