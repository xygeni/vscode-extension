import * as vscode from 'vscode';
import { Commands } from "../common/interfaces";
import { ConfigManager } from '../config/xygeni-configuration';
import { XygeniIssue } from '../common/interfaces';


export class DetailsView {
  public static readonly ID = 'xygeni.views.details';

  private static panel: vscode.WebviewPanel | undefined;

  public static showIssueDetails(issue: XygeniIssue, commands: Commands): void {
    // Open the file

    if (issue.file) {

      const beginLine = Math.max(0, (issue.beginLine || 1) - 1);
      const endLine = Math.max(0, (issue.endLine || issue.beginLine || 1) - 1);
      const beginColumn = Math.max(0, (issue.beginColumn || 1) - 1);
      const endColumn = issue.endColumn || Number.MAX_SAFE_INTEGER;

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fileUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, issue.file)
        : vscode.Uri.file(issue.file);

      // check file exists
      vscode.workspace.fs.stat(fileUri).then(() => {
        vscode.workspace.openTextDocument(fileUri).then(document => {
          vscode.window.showTextDocument(document, {
            selection: new vscode.Range(beginLine, beginColumn, endLine, endColumn),
            viewColumn: vscode.ViewColumn.One
          });
        });
      });
    }


    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'issueDetails',
        'Xygeni Issue Details',
        vscode.ViewColumn.Two,
        {
          enableScripts: true
        }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    const nonce = this.getNonce();
    let html = issue.getWebviewContent()
      .replaceAll('{{nonce}}', nonce)
      .replace('{{meta-security-policy}}', this.getMetaSecurityPolicy(nonce))
      .replace('{{xygeniStyle}}', commands.getXygeniCss());

    this.panel.webview.html = html;

    const xygeniUrl = ConfigManager.getXygeniUrl();
    if (!xygeniUrl) {
      this.panel.webview.html = 'Xygeni URL not configured.';
      return;
    }

    // sca vuln type dont have a detector
    if (issue.kind === 'sca_vulnerability') {
      return;
    }

    // retrieve detector doc
    const url = new URL(`${xygeniUrl}/internal/policy/detector/doc`);
    url.searchParams.append('tool', issue.tool);
    url.searchParams.append('kind', issue.kind);
    url.searchParams.append('detectorId', issue.detector);


    if (this.panel) {
      commands.getToken().then((token) => {
        if (!token) {
          return;
        }
        commands.getDetectorDoc(url, token).then((doc) => {
          const docJson = JSON.parse(doc);
          console.log('Detector Doc retrieved: ' + JSON.stringify(docJson));
          html = html.replace('<span>Loading...</span>', issue.getDetectorDetails(docJson));
          if (this.panel) {
            this.panel.webview.html = html;
          }
        });
      });
    }
  }

  private static getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private static getMetaSecurityPolicy(nonce: string): string {
    return `<meta http-equiv="Content-Security-Policy" content="style-src 'self' 'nonce-${nonce}'; font-src 'self' https://fonts.gstatic.com;" />`;
  }
} 
