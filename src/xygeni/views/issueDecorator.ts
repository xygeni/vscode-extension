import * as vscode from 'vscode';
import { XygeniIssue } from '../common/interfaces';

export class IssueDecorator {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private issuesByFile: Map<string, XygeniIssue[]> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Create decoration types for different severities
        this.createDecorationTypes();

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Listen for document changes to update decorations
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    // Debounce updates to avoid excessive decoration updates
                    setTimeout(() => this.updateDecorations(editor), 100);
                }
            })
        );

        // Update decorations for currently active editor
        if (vscode.window.activeTextEditor) {
            this.updateDecorations(vscode.window.activeTextEditor);
        }
    }

    private createDecorationTypes(): void {
        // High severity decoration (red background)
        this.decorationTypes.set('high', vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('errorBackground'),
            borderColor: new vscode.ThemeColor('errorBorder'),
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('errorForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        }));

        // Medium severity decoration (yellow background)
        this.decorationTypes.set('medium', vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('warningBackground'),
            borderColor: new vscode.ThemeColor('warningBorder'),
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('warningForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        }));

        // Low severity decoration (blue background)
        this.decorationTypes.set('low', vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('infoBackground'),
            borderColor: new vscode.ThemeColor('infoBorder'),
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('infoForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        }));
    }

    public updateIssues(issues: XygeniIssue[]): void {
        // Clear existing issues
        this.issuesByFile.clear();

        // Group issues by file
        for (const issue of issues) {
            if (issue.file && issue.line) {
                const normalizedPath = this.normalizeFilePath(issue.file);
                if (!this.issuesByFile.has(normalizedPath)) {
                    this.issuesByFile.set(normalizedPath, []);
                }
                this.issuesByFile.get(normalizedPath)!.push(issue);
            }
        }

        // Update decorations for all visible editors
        vscode.window.visibleTextEditors.forEach(editor => {
            this.updateDecorations(editor);
        });
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        const filePath = this.normalizeFilePath(editor.document.uri.fsPath);
        const issues = this.issuesByFile.get(filePath) || [];

        // Clear existing decorations
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });

        if (issues.length === 0) {
            return;
        }

        // Group issues by severity
        const issuesBySeverity: Map<string, XygeniIssue[]> = new Map();
        for (const issue of issues) {
            if (!issuesBySeverity.has(issue.severity)) {
                issuesBySeverity.set(issue.severity, []);
            }
            issuesBySeverity.get(issue.severity)!.push(issue);
        }

        // Create decorations for each severity
        issuesBySeverity.forEach((severityIssues, severity) => {
            const decorationType = this.decorationTypes.get(severity);
            if (!decorationType) {
                return;
            }

            const decorations: vscode.DecorationOptions[] = severityIssues.map(issue => {
                const line = Math.max(0, (issue.line || 1) - 1); // Convert to 0-based indexing
                const range = new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length);

                // Create hover message with issue details
                const hoverMessage = new vscode.MarkdownString();
                hoverMessage.appendMarkdown(`**${this.getSeverityIcon(issue.severity)} ${issue.severity.toUpperCase()} SEVERITY**\n\n`);
                hoverMessage.appendMarkdown(`**Issue:** ${issue.type}\n\n`);
                hoverMessage.appendMarkdown(`**Description:** ${issue.description}\n\n`);
                hoverMessage.appendMarkdown(`**File:** ${issue.file}\n\n`);
                hoverMessage.appendMarkdown(`**Line:** ${issue.line}`);
                hoverMessage.isTrusted = true;

                return {
                    range,
                    hoverMessage,
                    renderOptions: {
                        after: {
                            contentText: ` ${this.getSeverityIcon(issue.severity)} ${issue.type} (Xygeni)`,
                            color: this.getSeverityColor(issue.severity),
                            fontWeight: '',
                            fontStyle: 'font-size: 8px',
                            margin: '0 0 0 1em'
                        }
                    }
                };
            });

            //editor.setDecorations(decorationType, decorations);
        });
    }

    private normalizeFilePath(filePath: string): string {
        // Normalize file path to handle different path formats
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const workspacePath = workspaceFolder.uri.fsPath;
            if (filePath.startsWith(workspacePath)) {
                return filePath.substring(workspacePath.length + 1).replace(/\\/g, '/');
            }
        }
        return filePath.replace(/\\/g, '/');
    }

    private getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'critical':
                return '[critical]';
            case 'high':
                return '[high]';
            case 'medium':
                return '[medium]';
            case 'low':
                return '[low]';
            default:
                return '[info]';
        }
    }

    private getSeverityColor(severity: string): string {
        switch (severity) {
            case 'critical':
                return '#ff4444';
            case 'high':
                return '#ff8800';
            case 'medium':
                return '#ff8800';
            case 'low':
                return '#ffaa00';
            default:
                return '#4488ff';
        }
    }

    public dispose(): void {
        // Dispose of all decoration types
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();

        // Dispose of event listeners
        this.disposables.forEach(disposable => {
            disposable.dispose();
        });
        this.disposables = [];
    }
}
