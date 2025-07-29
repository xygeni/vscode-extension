import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ConfigManager } from './xygeni-configuration';

export class ConfigPanel {
    public static currentPanel: ConfigPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (ConfigPanel.currentPanel) {
            ConfigPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'xygeniConfig',
            'Xygeni Configuration',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [context.extensionUri]
            }
        );

        ConfigPanel.currentPanel = new ConfigPanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;

        // Set the webview's initial html content
        this._update(context);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveConfig':
                        this._saveConfiguration(message.xygeniUrl, message.xygeniToken, context);
                        return;
                    case 'testConnection':
                        this._testConnection(message.xygeniUrl, message.xygeniToken);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        ConfigPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update(context: vscode.ExtensionContext) {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview, context);
    }

    private async _saveConfiguration(xygeniUrl: string, xygeniToken: string, context: vscode.ExtensionContext) {
        try {
            await ConfigManager.updateFullConfig({ xygeniUrl, xygeniToken}, context);
            this._panel.webview.postMessage({ command: 'configSaved' });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save configuration: ${error}`);
        }
    }

    private async _testConnection(xygeniUrl: string, xygeniToken: string) {
        try {
            // Basic URL validation
            if (!xygeniUrl || !xygeniToken) {
                this._panel.webview.postMessage({
                    command: 'connectionError',
                    error: 'Both Xygeni URL and Authentication Token are required'
                });
                return;
            }

            // Validate URL format
            try {
                new URL(xygeniUrl);
            } catch {
                this._panel.webview.postMessage({
                    command: 'connectionError',
                    error: 'Invalid URL format'
                });
                return;
            }

            // Here you would implement the actual connection test
            // For now, we'll just simulate a successful connection
            // In a real implementation, you would make an HTTP request to the Xygeni API

            // Simulate async operation
            await new Promise(resolve => setTimeout(resolve, 1000));

            this._panel.webview.postMessage({ command: 'connectionSuccess' });

        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionError',
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
    }

    private async _getHtmlForWebview(webview: vscode.Webview, context: vscode.ExtensionContext) {
        const xygeniUrl = ConfigManager.getXygeniUrl();
        const xygeniToken = await ConfigManager.getXygeniToken(context);

        // Read HTML template from file


        // Replace template variables
        const templatePath = path.join(context.extensionPath, 'media', 'templates', '/configuration-panel.html');
        let templateHtml = fs.readFileSync(templatePath, 'utf8');

        const html = templateHtml
                .replace(/{{xygeniUrl}}/g, xygeniUrl || '')
                .replace(/{{xygeniToken}}/g, xygeniToken || '');
            
            
        return html;
    }
}
