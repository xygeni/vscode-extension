import * as vscode from 'vscode';
import { XygeniIssue } from '../common/interfaces';
import { Logger } from '../common/logger';

export class DiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Create a diagnostic collection for security issues
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('xygeni-security');

        // Listen for document changes to update diagnostics
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                // Debounce updates to avoid excessive diagnostic updates
                setTimeout(() => this.updateDiagnosticsForDocument(event.document), 100);
            })
        );

        // Listen for document close to clear diagnostics
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(document => {
                this.diagnosticCollection.delete(document.uri);
            })
        );
    }

    /**
     * Update diagnostics for all issues
     */
    public updateDiagnostics(issues: XygeniIssue[]): void {
        // Clear all existing diagnostics
        this.diagnosticCollection.clear();

        // Group issues by file
        const issuesByFile = new Map<string, XygeniIssue[]>();

        for (const issue of issues) {
            if (issue.file && issue.line) {
                const normalizedPath = this.normalizeFilePath(issue.file);
                if (!issuesByFile.has(normalizedPath)) {
                    issuesByFile.set(normalizedPath, []);
                }
                issuesByFile.get(normalizedPath)!.push(issue);
            }
        }

        // Create diagnostics for each file
        issuesByFile.forEach((fileIssues, filePath) => {
            this.setDiagnosticsForFile(filePath, fileIssues);
        });
    }

    /**
     * Set diagnostics for a specific file
     */
    private setDiagnosticsForFile(filePath: string, issues: XygeniIssue[]): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        // Create URI for the file
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);

        // Convert issues to diagnostics
        const diagnostics: vscode.Diagnostic[] = issues.map(issue => this.createDiagnostic(issue));

        // Set diagnostics for the file
        this.diagnosticCollection.set(fileUri, diagnostics);
    }

    /**
     * Create a VSCode diagnostic from a security issue
     */
    private createDiagnostic(issue: XygeniIssue): vscode.Diagnostic {
        // Convert 1-based line number to 0-based
        const line = Math.max(0, (issue.line || 1) - 1);

        // Create range for the entire line (we could make this more specific if we had column info)
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);

        // Map severity to VSCode diagnostic severity
        const severity = this.mapSeverityToDiagnosticSeverity(issue.severity);

        // Create the diagnostic
        const diagnostic = new vscode.Diagnostic(
            range,
            `${issue.type}: ${issue.description}`,
            severity
        );

        // Set source to identify our diagnostics
        diagnostic.source = 'Xygeni Security';

        // Set code for the issue (can be used for quick fixes later)
        diagnostic.code = {
            value: `${issue.category} - ${issue.type}`,
            target: vscode.Uri.parse(`command:xygeni.showIssueDetailsFromDiagnostic?${encodeURIComponent(JSON.stringify([issue.id]))}`)
        };

        // Add tags based on severity
        diagnostic.tags = this.getDiagnosticTags(issue.severity);

        return diagnostic;
    }

    /**
     * Map security issue severity to VSCode diagnostic severity
     */
    private mapSeverityToDiagnosticSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'medium':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }

    /**
     * Get diagnostic tags based on severity
     */
    private getDiagnosticTags(severity: string): vscode.DiagnosticTag[] {
        const tags: vscode.DiagnosticTag[] = [];

        // Add security-related tag for high severity issues
        if (severity === 'high') {
            // Note: DiagnosticTag.Security is not available in all VSCode versions
            // We'll use Unnecessary as a placeholder or omit tags
        }

        return tags;
    }

    /**
     * Update diagnostics for a specific document
     */
    private updateDiagnosticsForDocument(document: vscode.TextDocument): void {
        // This method can be used to update diagnostics when a document changes
        // For now, we'll keep the existing diagnostics as they are based on static analysis
        // In a real implementation, you might want to re-analyze the document
    }

    /**
     * Normalize file path to be relative to workspace
     */
    private normalizeFilePath(filePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const workspacePath = workspaceFolder.uri.fsPath;
            if (filePath.startsWith(workspacePath)) {
                return filePath.substring(workspacePath.length + 1).replace(/\\/g, '/');
            }
        }
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Add a single issue as a diagnostic
     */
    public addIssue(issue: XygeniIssue): void {
        if (!issue.file || !issue.line) {
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const normalizedPath = this.normalizeFilePath(issue.file);
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);

        // Get existing diagnostics for the file
        const existingDiagnostics = this.diagnosticCollection.get(fileUri) || [];

        // Create new diagnostic
        const newDiagnostic = this.createDiagnostic(issue);

        // Add to existing diagnostics
        const updatedDiagnostics = [...existingDiagnostics, newDiagnostic];

        // Update diagnostics for the file
        this.diagnosticCollection.set(fileUri, updatedDiagnostics);
    }

    /**
     * Remove diagnostics for a specific issue
     */
    public removeIssue(issueId: string): void {
        // Iterate through all diagnostics and remove the one with matching code
        this.diagnosticCollection.forEach((uri, diagnostics) => {
            const filteredDiagnostics = diagnostics.filter(diagnostic => diagnostic.code !== issueId);
            if (filteredDiagnostics.length !== diagnostics.length) {
                this.diagnosticCollection.set(uri, filteredDiagnostics);
            }
        });
    }

    /**
     * Clear all diagnostics
     */
    public clearDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    /**
     * Dispose of the diagnostic provider
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}
