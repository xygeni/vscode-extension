import * as vscode from 'vscode';
import { Commands } from "../common/interfaces";
import { ConfigManager } from '../config/xygeni-configuration';
import { XygeniIssue } from '../common/interfaces';
import { Logger } from '../common/logger';
import path from 'path';
import { MarkdownParser } from '../common/markdown';
import { ISSUE_DETAILS_REMEDIATE_FUNCTION, ISSUE_DETAILS_SAVE_FUNCTION } from '../common/constants';
import { RemediationService } from '../service/remediation';
import InstallerService from '../service/installer';
import _ from 'lodash';


export class DetailsView {
  public static readonly ID = 'xygeni.views.details';

  private static panel: vscode.WebviewPanel | undefined;


  public static showIssueDetails(issue: XygeniIssue, commands: Commands): void {

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    }
    else {
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
        localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file(commands.getExtensionPath()), 'media')]
      };

      // Handle messages from the webview - register only once when panel is created
      this.panel.webview.onDidReceiveMessage(async (message) => {
        const issueId = message.issueId;
        const sourceFile = message.file;

        if (message.command === 'jumpToFrame') {
          if (await commands.fileExistsInProject(sourceFile)) {
            const fileUri = vscode.Uri.file(commands.getAbsolutePathForSourceFile(sourceFile));
            vscode.workspace.openTextDocument(fileUri).then(document => {
              vscode.window.showTextDocument(document, {
                selection: new vscode.Range(
                  Math.max(0, message.beginLine - 1),
                  Math.max(0, message.beginColumn - 1),
                  Math.max(0, message.endLine - 1),
                  Math.max(0, message.endColumn - 1)
                ),
                viewColumn: vscode.ViewColumn.One
              });
            });
          }
          return;
        }

        if (await commands.fileExistsInProject(sourceFile)) {
          const filePath = commands.getAbsolutePathForSourceFile(sourceFile);
          //Logger.log(`Remediation message... ${issueId} ${message.kind} ${message.file}  `);
          this.handleRemediationView(this.panel, message, filePath, commands);
        }

      });
    }

    const xygeniUrl = ConfigManager.getXygeniUrl();
    if (!xygeniUrl) {
      this.panel.webview.html = 'Xygeni URL not configured.';
      return;
    }

    const nonce = this.getNonce();


    let html = issue.getWebviewContent()
      .replace('{{meta-security-policy}}', this.getMetaSecurityPolicy(nonce, this.panel.webview.cspSource))
      .replace('{{iconsPath}}', this.panel.webview.asWebviewUri(vscode.Uri.file(commands.getIconsPath())).toString())
      .replace('{{xygeniCss}}', this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(commands.getExtensionPath(), 'media', 'css', 'xygeni.css'))).toString())
      .replace('{{xygeniStyle}}', commands.getXygeniCss())
      .replaceAll('{{nonce}}', nonce);

      Logger.log(html);

    if (issue.file) {

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fileUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, issue.file)
        : vscode.Uri.file(issue.file);

      // highlight code
      vscode.workspace.fs.stat(fileUri).then(() => {
        vscode.workspace.openTextDocument(fileUri).then(document => {
          vscode.window.showTextDocument(document, {
            selection: new vscode.Range(issue.beginLine, issue.beginColumn, issue.endLine, issue.endColumn),
            viewColumn: vscode.ViewColumn.One
          });
        });
      });
    }

    this.panel.webview.html = html;

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
          const details = issue.getDetectorDetails(docJson);
          //console.log('Detector Doc retrieved: ' + JSON.stringify(docJson));
          html = html.replace('<span>Loading...</span>', details);
          if (this.panel) {
            //this.panel.webview.html = html;
          }

          // push message
          this.panel?.webview.postMessage({
            status: "UPDATE_DETECTOR_DOC_FUNCTION",
            details: details
          });
        });
      });
    }
  }

  static handleRemediationView(panel: vscode.WebviewPanel | undefined, message: any, fileUri: string, commands: Commands): void {
    switch (message.command) {
      case ISSUE_DETAILS_REMEDIATE_FUNCTION:
        // check scanner is installed
        const isXygeniInstalled = commands.isInstallReady();
        if (!isXygeniInstalled) {
          Logger.log('Xygeni is not installed. Remediation not applied.');
          if (panel) {
            panel.webview.postMessage({ status: 'remediationError', error: 'Xygeni is not installed. Remediation not applied.' });
          }
          return;
        }

        RemediationService.getInstance().launchRemediationPreview(
          message.kind, message.issueId, fileUri,
          InstallerService.getInstance().getScannerInstallationDir(),
          commands.getScanOutputChannel())
          .then(({ tempFile, explanation }) => {
            if (tempFile) {

              commands.openDiffViewCommand(fileUri, tempFile);
              // Notify the webview that remediation is available
              if (panel) {
                panel.webview.postMessage({ status: 'remediationReady', explanation: explanation });
              }
              return;
            }

            Logger.log(`Remediation NOT applied for issue ${message.issueId} ${fileUri}`);
            if (panel) {
              panel.webview.postMessage({ status: 'remediationError' });
            }

          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.log(`Error when preview remediation sca: ${errorMessage}`);
            // Notify the webview that remediation failed and reset button state
            if (panel) {
              panel.webview.postMessage({ status: 'remediationError', error: errorMessage });
            }
          });
        break;

      case ISSUE_DETAILS_SAVE_FUNCTION:
        // Apply the remediation using the code action provider
        commands.saveRemediationChanges(fileUri)
          .then(() => {
            // close "Xygeni Fix Preview" file tab
            if (panel) {
              panel.webview.postMessage({ status: 'remediationComplete' });
            }

            Logger.log(`Remediation saved for ${fileUri}`);
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.log(`Error when save remediation changes: ${errorMessage}`);
          });

        break;
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
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'nonce-${nonce}' https://d3js.org; img-src ${cspSource}; style-src ${cspSource} 'nonce-${nonce}'; font-src ${cspSource} https://fonts.gstatic.com;" />`;
  }
}
