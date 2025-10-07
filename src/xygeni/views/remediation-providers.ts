import * as vscode from 'vscode';
import { Logger } from '../common/logger';
import { Commands, XyContext } from '../common/interfaces';


/**
 * Diff provider allow to preview a fix before save.
 * Mantain a list of file's preview and execute a save when the user accept the fix
 */
export class RemediationDiffContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this._onDidChange.event;

  // map from URI to content with timestamp for cleanup
  private contentMap = new Map<string, { content: string; timestamp: number }>();
  private readonly maxAgeMs = 5 * 60 * 1000; // 5 minutes TTL
  private readonly maxEntries = 50; // Maximum number of cached entries

  constructor(private xygeniContext: XyContext,
    private commands: Commands) {
    // Clean up old entries periodically
    setInterval(() => this.cleanup(), 300000); // Clean every minute
  }

  /** Copy and save changes to fileUri if proposed remediation content is available */
  public async saveRemediationChanges(fileUri: string): Promise<void> {

    const uri = vscode.Uri.parse(fileUri);
    const document = await vscode.workspace.openTextDocument(uri);

    const previewUri = vscode.Uri.parse(`preview-fix:${uri.path}.fixed`);

    // Access the private remediationData set from the provider
    const content = this.provideTextDocumentContent(previewUri);
    if (!content) {
      Logger.log('Remediation diff content null. Remediation not saved.');
      return;
    }

    const startLine = 0; // Apply the remediation to whole file
    const lines = content.split("\n");

    if (lines && lines.length > 0) {
      const startPos = new vscode.Position(startLine, 0);
      const endLine = startLine + lines.length - 1;
      const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

      const replacementRange = new vscode.Range(startPos, endPos);
      const replacementText = content;

      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.replace(uri, replacementRange, replacementText);

      // Apply the edit
      await vscode.workspace.applyEdit(workspaceEdit);

      //Logger.log(`File saved: ${fileUri}`);
      this.closeTabDiff(previewUri);      
    }
    return Promise.resolve();
  }

  private closeTabDiff(previewUri: vscode.Uri) {
    const tabGroups = vscode.window.tabGroups.all;
    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          if (tab.input.modified.path === previewUri.path) {
            vscode.window.tabGroups.close(tab);
            return;
          }
        }
      }
    }
  }

  // ===============================================
  // content provider functions

  setContent(previewUri: string, content: string) {
    this.cleanupIfNeeded();
    this.contentMap.set(previewUri, { content, timestamp: Date.now() });
    this._onDidChange.fire(vscode.Uri.parse(previewUri));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const entry = this.contentMap.get(uri.toString());
    if (!entry) { return ''; }

    // Update timestamp on access to implement LRU-like behavior
    entry.timestamp = Date.now();
    return entry.content;
  }

  private cleanupIfNeeded() {
    // Clean up expired entries
    const now = Date.now();
    for (const [uri, entry] of this.contentMap) {
      if (now - entry.timestamp > this.maxAgeMs) {
        this.contentMap.delete(uri);
      }
    }

    // Limit the number of entries to prevent unbounded growth
    if (this.contentMap.size >= this.maxEntries) {
      const entries = Array.from(this.contentMap.entries());
      // Sort by timestamp (oldest first) and remove oldest entries
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, this.contentMap.size - this.maxEntries + 10); // Remove 10 oldest when at limit
      for (const [uri] of toRemove) {
        this.contentMap.delete(uri);
      }
    }
  }

  private cleanup() {
    this.cleanupIfNeeded();
  }

  // Public method to manually clear cache if needed
  public clear() {
    this.contentMap.clear();
  }

}

/** 
 * Code Action provider allow to add a code-fix to Quick-Fix menu 
 * Not in use by now...
 */
export class RemediationCodeActionProvider implements vscode.CodeActionProvider {
  private remediationData: Set<RemediationData> = new Set();

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  public setRemediationData(data: RemediationData): void {
    this.remediationData.add(data);
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Check if there are any remediation data available
    for (const data of this.remediationData) {
            
      if (data.start !== undefined && data.lines && data.lines.length > 0) {
        const action = new vscode.CodeAction(
          `Fix with Xygeni Agent(${data.issueId})`,
          vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();

        // Calculate the range to replace
        const startLine = data.start;
        const endLine = startLine + data.lines.length - 1;

        // Get the range of lines to replace
        const startPos = new vscode.Position(startLine, 0);
        const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);

        const replacementRange = new vscode.Range(startPos, endPos);

        // Join the lines with newlines
        const replacementText = data.lines.join('\n');

        action.edit.replace(vscode.Uri.parse(data.fileUri), replacementRange, replacementText);
        
        actions.push(action);
      }
    }

    return actions;
  }
}

export class RemediationData {
  issueId: string;
  start: number;
  lines: string[];
  fileUri: string;

  constructor(issueId: string, start: number, lines: string[], fileUri: string) {
    this.issueId = issueId;
    this.start = start;
    this.lines = lines;
    this.fileUri = fileUri;
  }
}
