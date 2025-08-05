import * as vscode from 'vscode';
import { XygeniIssue } from '../common/interfaces';

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
            if (issue.file) {
                const normalizedPath = this.normalizeFilePath(issue.file);
                if (!issuesByFile.has(normalizedPath)) {
                    issuesByFile.set(normalizedPath, []);
                }
                issuesByFile.get(normalizedPath)!.push(issue);
            }
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];


        // Create diagnostics for each file
        issuesByFile.forEach((fileIssues, filePath) => {
            // check file exists
            const fileUri = workspaceFolder
                ? vscode.Uri.joinPath(workspaceFolder.uri, filePath)
                : vscode.Uri.file(filePath);
            vscode.workspace.fs.stat(fileUri).then(() => {
                this.setDiagnosticsForFile(filePath, fileIssues);
            });
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
        const beginLine = Math.max(0, (issue.beginLine || 1) - 1);
        const endLine = Math.max(0, (issue.endLine || issue.beginLine || 1) - 1);
        const begingColumn = Math.max(0, (issue.beginColumn || 1) - 1);
        const endColumn = issue.endColumn || Number.MAX_SAFE_INTEGER;

        // Create range for the entire line (we could make this more specific if we had column info)
        const range = new vscode.Range(beginLine, begingColumn, endLine, endColumn);

        // Map severity to VSCode diagnostic severity
        const severity = this.mapSeverityToDiagnosticSeverity(issue.severity);

        // Create the diagnostic
        const diagnostic = new vscode.Diagnostic(
            range,
            `${issue.type} [${issue.severity}]: ${issue.explanation.length < 100 ? issue.explanation : issue.explanation.slice(0, 100)}... `,
            severity
        );

        // Set source to identify our diagnostics
        diagnostic.source = 'Xygeni Security';

        // Set code for the issue (can be used for quick fixes later)
        diagnostic.code = {
            value: `${issue.category} - ${issue.detector}`,
            target: vscode.Uri.parse(`command:xygeni.showIssueDetailsFromDiagnostic?${encodeURIComponent(JSON.stringify([issue.id]))}`)
        };

        return diagnostic;
    }

    /**
     * Map security issue severity to VSCode diagnostic severity
     */
    private mapSeverityToDiagnosticSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'critical':
                return vscode.DiagnosticSeverity.Error;
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'medium':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
                return vscode.DiagnosticSeverity.Warning;
            case 'info':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }



    /**
     * Update diagnostics for a specific document
     */
    private updateDiagnosticsForDocument(document: vscode.TextDocument): void {
        // This method can be used to update diagnostics when a document changes
        // TODO: Implement this when incremental scans are implemented
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
        if (!issue.file) {
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
