import * as vscode from 'vscode';
import { Commands } from "../common/interfaces";
import { ConfigManager } from '../config/xygeni-configuration';
import { XygeniIssue } from '../common/interfaces';
import { Logger } from '../common/logger';
import path from 'path';
import { MarkdownParser } from '../common/markdown';


export class DetailsView {
  public static readonly ID = 'xygeni.views.details';

  private static panel: vscode.WebviewPanel | undefined;

  public static showIssueDetails(issue: XygeniIssue, commands: Commands): void {
    // Open the file

    if (issue.file) {

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fileUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, issue.file)
        : vscode.Uri.file(issue.file);

      // check file exists
      vscode.workspace.fs.stat(fileUri).then(() => {
        vscode.workspace.openTextDocument(fileUri).then(document => {
          vscode.window.showTextDocument(document, {
            selection: new vscode.Range(issue.beginLine, issue.beginColumn, issue.endLine, issue.endColumn),
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
      this.panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath( vscode.Uri.file(commands.getExtensionPath()), 'media')]
      };
    }

    const nonce = this.getNonce();
  

    let html = issue.getWebviewContent()
      .replace('{{meta-security-policy}}', this.getMetaSecurityPolicy(nonce, this.panel.webview.cspSource))
      .replace('{{iconsPath}}', this.panel.webview.asWebviewUri(vscode.Uri.file(commands.getIconsPath())).toString())  
      .replace('{{xygeniCss}}', this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(commands.getExtensionPath(), 'media', 'css', 'xygeni.css'))).toString())          
      .replace('{{xygeniStyle}}', commands.getXygeniCss())
      .replaceAll('{{nonce}}', nonce);

  
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

  private static getMetaSecurityPolicy(nonce: string, cspSource: string): string {
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; img-src ${cspSource} https:; style-src ${cspSource} 'nonce-${nonce}'; font-src ${cspSource} https://fonts.gstatic.com;" />`;
  }
} 
