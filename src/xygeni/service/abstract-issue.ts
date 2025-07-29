
import * as vscode from 'vscode';
import { Commands, XygeniIssue } from '../common/interfaces';
import { Logger } from '../common/logger';
import { getHttpClient } from '../common/https';
import { ConfigManager } from '../config/xygeni-configuration';
import { IncomingMessage } from 'http';

export abstract class AbstractXygeniIssue implements XygeniIssue {
  id: string;
  type: string;
  detector: string;
  tool: string;
  kind: 'secret' | 'misconfiguration' | 'iac_flaw' | 'code_vulnerability' | 'sca_vulnerability';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'highest' | 'high' | 'medium' | 'low';
  category: 'secrets' | 'misconf' | 'iac' | 'sast' | 'sca';
  categoryName: 'Secret' | 'Misconfiguration' | 'IaC' | 'SAST' | 'Vulnerability';
  file?: string;
  line?: number;
  code?: string;
  tags?: string[];
  description: string;

  private static panel: vscode.WebviewPanel | undefined;

  constructor(issue: XygeniIssue) {
    this.id = issue.id;
    this.type = issue.type;
    this.detector = issue.detector;
    this.tool = issue.tool;
    this.kind = issue.kind;
    this.severity = issue.severity;
    this.confidence = issue.confidence;
    this.category = issue.category;
    this.categoryName = issue.categoryName;
    this.file = issue.file;
    this.line = issue.line;
    this.code = issue.code;
    this.tags = issue.tags;
    this.description = issue.description;
  }

  public showIssueDetails(commands: Commands): void {
    // Open the file
    if (this.file && this.line) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fileUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, this.file)
        : vscode.Uri.file(this.file);

      vscode.commands.executeCommand('vscode.open', fileUri, {
        selection: this.line > 0 ? new vscode.Range(this.line - 1, 0, this.line - 1, 0) : undefined,
        viewColumn: vscode.ViewColumn.One
      });
    }


    if (AbstractXygeniIssue.panel) {
      AbstractXygeniIssue.panel.reveal(vscode.ViewColumn.Two);
    } else {
      AbstractXygeniIssue.panel = vscode.window.createWebviewPanel(
        'issueDetails',
        'Xygeni Issue Details',
        vscode.ViewColumn.Two,
        {
          enableScripts: true
        }
      );
      AbstractXygeniIssue.panel.onDidDispose(() => {
        AbstractXygeniIssue.panel = undefined;
      });
    }

    const nonce = this.getNonce();
    let html = this.getWebviewContent()
      .replaceAll('{{nonce}}', nonce)
      .replace('{{meta-security-policy}}', this.getMetaSecurityPolicy(nonce))
      .replace('{{xygeniStyle}}', commands.getXygeniCss());

    AbstractXygeniIssue.panel.webview.html = html;

    const xygeniUrl = ConfigManager.getXygeniUrl();
    if (!xygeniUrl) {
      AbstractXygeniIssue.panel.webview.html = 'Xygeni URL not configured.';
      return;
    }

    // retrieve detector doc
    const url = new URL(`${xygeniUrl}/internal/policy/detector/doc`);
    url.searchParams.append('tool', this.tool);
    url.searchParams.append('kind', this.kind);
    url.searchParams.append('detectorId', this.detector);

    const client = getHttpClient(url.toString());
    client.get(url.toString(), (res) => {
      let doc = '';
      res.on('data', (chunk) => {
        doc += chunk;
      });
      res.on('end', () => {
        if (AbstractXygeniIssue.panel) {
          if (doc.indexOf('detector_not_found') > -1) {
            Logger.log('Detector Doc not found ' + this.detector);
            return;
          }
          try {
            const docJson = JSON.parse(doc);
            html = html.replace('<span>Loading...</span>', this.getDetectorDetails(docJson));
            AbstractXygeniIssue.panel.webview.html = html;
          }
          catch (e: any) {
            Logger.log('Error reading detctor doc. ' + e.message);
          }
        }
      });
    }).on('error', (err) => {
      Logger.error(err, 'Error loading issue doc');
      if (AbstractXygeniIssue.panel) {
        AbstractXygeniIssue.panel.webview.html = `Error loading issue doc: ${err.message}`;
      }
    });
  }

  private getMetaSecurityPolicy(nonce: string): string {
    return `<meta http-equiv="Content-Security-Policy" content="style-src 'self' 'nonce-${nonce}'; font-src 'self' https://fonts.gstatic.com;" />`;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  abstract getIssueDetailsHtml(): string;
  abstract getCodeSnippetHtmlTab(): string;
  abstract getCodeSnippetHtml(): string;
  abstract getDetectorDetails(doc: any): string;

  protected getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        {{meta-security-policy}}
        <title>Xygeni Issue Details</title>
        <style nonce="{{nonce}}">{{xygeniStyle}}</style>
      </head>
      <body>
            <h1>Xygeni ${this.categoryName} Issue</h1>
            <p><span class="xy-slide-${this.severity}">${this.severity}</span> ${this.type}</p>
          
            <section class="xy-tabs-section">
            <input type="radio" name="tabs" id="tab-1" checked>
            <label for="tab-1">ISSUE DETAILS</label>
            ${this.getCodeSnippetHtmlTab()}
            
            ${this.getIssueDetailsHtml()}
            ${this.getCodeSnippetHtml()}

            </section>
      </body>
      </html>
    `;
  }
}
