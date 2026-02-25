import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Commands } from '../common/interfaces';
import { Logger } from '../common/logger';

export class McpSetupView {
  public static readonly ID = 'xygeni.views.mcpSetup';

  private static panel: vscode.WebviewPanel | undefined;

  public static async showMcpSetup(commands: Commands): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'mcpSetup',
        'Xygeni MCP Server Setup Guide',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file(commands.getExtensionPath()), 'media')]
      };
    }

    const panel = this.panel;
    if (!panel) {
      return;
    }

    const nonce = this.getNonce();
    const configuredMcpLibraryPath = commands.getMcpLibraryPath();
    const fallbackMcpLibraryPath = path.join(commands.getExtensionPath(), '.xygeni-mcp', 'xygeni-mcp-server.jar');
    const mcpLibraryPath = configuredMcpLibraryPath || (fs.existsSync(fallbackMcpLibraryPath) ? fallbackMcpLibraryPath : undefined);
    const isMcpLibraryInstalled = mcpLibraryPath !== undefined;
    const scannerInstallDirectory = commands.getScannerInstallationDir();
    const scannerInstalled = commands.isInstallReady();
    const javaHome = process.env.JAVA_HOME || '$JAVA_HOME';
    const savedUrl = await commands.getXygeniUrl();
    const savedToken = await commands.getToken();
    if (this.panel !== panel) {
      return;
    }
    const xygeniUrl = savedUrl || '$XYGENI_URL';
    const xygeniToken = savedToken || '$XYGENI_TOKEN';

    const serverName = 'xygeni-mcp-server';
    const jarPath = mcpLibraryPath || '$XYGENI_MCP_SERVER_JAR';
    const scannerPathArg = `--scannerPath=${scannerInstallDirectory}`;

    const jsonConfig = JSON.stringify({
      servers: {
        [serverName]: {
          timeout: 60,
          type: 'stdio',
          command: 'java',
          args: [
            '-jar',
            jarPath,
            scannerPathArg
          ],
          env: {
            JAVA_HOME: javaHome,
            XYGENI_URL: xygeniUrl,
            XYGENI_TOKEN: xygeniToken
          }
        }
      }
    }, null, 2);

    const tomlConfig = this.buildTomlConfig(serverName, jarPath, scannerPathArg, javaHome, xygeniUrl, xygeniToken);

    // Auto-import the MCP documentation
    this.loadMcpDocumentation();

    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Xygeni MCP Server Setup Guide</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource}; style-src 'nonce-${nonce}'; font-src https://fonts.gstatic.com;">
        <style nonce="${nonce}">
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                margin: 0;
                padding: 20px;
                line-height: 1.6;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
            }
            h1, h2, h3 {
                color: var(--vscode-textLink-foreground);
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 8px;
            }
            h1 {
                font-size: 24px;
                margin-bottom: 24px;
            }
            h2 {
                font-size: 20px;
                margin-top: 32px;
            }
            h3 {
                font-size: 16px;
                margin-top: 24px;
            }
            .code-block {
                background-color: var(--vscode-textBlockQuote-background);
                border: 1px solid var(--vscode-textBlockQuote-border);
                border-radius: 4px;
                padding: 12px;
                margin: 12px 0;
                font-family: var(--vscode-editor-font-family);
                overflow-x: auto;
            }
            .step {
                margin: 16px 0;
                padding: 12px;
                background-color: var(--vscode-toolbar-hoverBackground);
                border-radius: 4px;
                border-left: 4px solid var(--vscode-textLink-foreground);
            }
            .step-number {
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                margin-bottom: 8px;
            }
            .note {
                background-color: var(--vscode-inputValidation-infoBackground);
                border: 1px solid var(--vscode-inputValidation-infoBorder);
                border-radius: 4px;
                padding: 12px;
                margin: 12px 0;
            }
            .warning {
                background-color: var(--vscode-inputValidation-warningBackground);
                border: 1px solid var(--vscode-inputValidation-warningBorder);
                border-radius: 4px;
                padding: 12px;
                margin: 12px 0;
            }
            .feature-list {
                list-style: none;
                padding: 0;
            }
            .feature-list li {
                padding: 4px 0;
                position: relative;
                padding-left: 20px;
            }
            .feature-list li:before {
                content: "✓";
                color: var(--vscode-charts-green);
                position: absolute;
                left: 0;
                font-weight: bold;
            }
            .copy-button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                border-radius: 2px;
                cursor: pointer;
                font-size: 12px;
                margin: 4px;
            }
            .copy-button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Xygeni MCP Server Setup Guide</h1>

            <p>This guide explains how to set up an MCP (Model Context Protocol) server that uses Xygeni's local scanner JAR file to provide security analysis tools to AI assistants.</p>

            <h2>What is MCP?</h2>
            <p>MCP (Model Context Protocol) is a protocol that enables AI assistants to access external tools and data sources. Xygeni's MCP server exposes security scanning capabilities through standardized tool interfaces.</p>

            <h2>Features</h2>
            <ul class="feature-list">
                <li>SAST (Static Application Security Testing) analysis</li>
                <li>SCA (Software Composition Analysis) for dependencies</li>
                <li>Secrets detection</li>
                <li>IaC (Infrastructure as Code) security scanning</li>
                <li>Misconfiguration detection</li>
                <li>Real-time security insights</li>
            </ul>

            <h2>Prerequisites</h2>
            <div class="step">
                <div class="step-number">Install Xygeni Scanner</div>
                <p>Set up your Xygeni API URL and authentication token and
                ensure the Xygeni scanner is properly installed through the VSCode extension.</p>
            </div>
            ${scannerInstalled && isMcpLibraryInstalled ? `
            <h2>Setup Instructions</h2>

            <div class="note">
                <strong>Note:</strong> The Xygeni scanner JAR is automatically downloaded when you install the scanner.
            </div>

            <div class="warning">
                ${savedToken
                  ? '<strong>Security note:</strong> The following examples include your current <code>XYGENI_TOKEN</code> in clear text under <code>servers.env</code>. Keep this file private.'
                  : '<strong>Warning:</strong> No token is currently stored in Xygeni settings. Replace <code>$XYGENI_TOKEN</code> with your real token before using the config.'}
            </div>

            <div class="step">
                <div class="step-number">Step 1: Create MCP Server Configuration</div>
                <p>Create a new MCP server configuration file. Use JSON or TOML depending on your MCP client:</p>

                <h3>JSON</h3>
                <div class="code-block"><pre>${this.escapeHtml(jsonConfig)}</pre></div>
                <button class="copy-button" onclick="copyToClipboard(this.previousElementSibling.textContent)">Copy JSON Config</button>

                <h3>TOML</h3>
                <div class="code-block"><pre>${this.escapeHtml(tomlConfig)}</pre></div>
                <button class="copy-button" onclick="copyToClipboard(this.previousElementSibling.textContent)">Copy TOML Config</button>
            </div>

            <div class="step">
                <div class="step-number">Step 2: Configure Your MCP Client</div>
                <p>Depending on your MCP client (VSCode extension, IDE, or AI assistant), follow these general steps:</p>

                <h3>For MCP-compatible AI Assistants:</h3>
                <ol>
                    <li>Locate your MCP configuration file (usually <code>mcp.json</code>, <code>.mcp/config.json</code>, or client-specific <code>mcp.toml</code>)</li>
                    <li>Add the Xygeni server configuration as shown above</li>
                    <li>Restart your MCP client or reload the configuration</li>
                </ol>
            </div>
            ` : ''}
            ${scannerInstalled ? '' : 
                `<p>Please install the Xygeni scanner first to access MCP server setup instructions and available tools.</p>`}

            <h2>Get Help</h2>
            <p>For more information and support:</p>
            <ul>
                <li><a href="https://docs.xygeni.io" target="_blank">Xygeni Documentation</a></li>
            </ul>

        </div>

        <script nonce="${nonce}">
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    console.log('Copied to clipboard:', text);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }

            // Make copyToClipboard function globally available
            window.copyToClipboard = copyToClipboard;
        </script>
    </body>
    </html>`;

    if (this.panel === panel) {
      panel.webview.html = html;
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

  private static buildTomlConfig(
    serverName: string,
    jarPath: string,
    scannerPathArg: string,
    javaHome: string,
    xygeniUrl: string,
    xygeniToken: string
  ): string {
    const quotedServerName = this.tomlQuote(serverName);
    const quotedJarPath = this.tomlQuote(jarPath);
    const quotedScannerPathArg = this.tomlQuote(scannerPathArg);
    const quotedJavaHome = this.tomlQuote(javaHome);
    const quotedXygeniUrl = this.tomlQuote(xygeniUrl);
    const quotedXygeniToken = this.tomlQuote(xygeniToken);

    return `[servers.${quotedServerName}]
timeout = 60
type = "stdio"
command = "java"
args = [
  "-jar",
  ${quotedJarPath},
  ${quotedScannerPathArg}
]

[servers.${quotedServerName}.env]
JAVA_HOME = ${quotedJavaHome}
XYGENI_URL = ${quotedXygeniUrl}
XYGENI_TOKEN = ${quotedXygeniToken}`;
  }

  private static tomlQuote(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private static escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private static async loadMcpDocumentation() {
    // This would load MCP documentation if needed
    // For now, the documentation is embedded in the HTML
    Logger.log('MCP Setup documentation loaded');
  }
}
