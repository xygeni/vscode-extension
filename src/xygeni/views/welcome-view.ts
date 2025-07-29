import * as vscode from 'vscode';
import { XYGENI_SHOW_CONFIG_COMMAND } from '../common/constants';
import { ConfigManager } from '../config/xygeni-configuration';

export class WelcomeView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'xygeni.views.welcome_old_TO_DELETE';

    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) { }

    public hide() {
        if (this._view) {
            this._view.show(false);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._context.extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'openConfig':
                    vscode.commands.executeCommand(XYGENI_SHOW_CONFIG_COMMAND);
                    break;
                case 'runScan':
                    this._runScan();
                    break;
                case 'openDocs':
                    vscode.env.openExternal(vscode.Uri.parse('https://docs.xygeni.io'));
                    break;
                case 'checkConfig':
                    this._updateConfigStatus();
                    break;
            }
        });

        // Update the view when it becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateConfigStatus();
            }
        });

        // Initial config status check
        this._updateConfigStatus();
    }

    private async _updateConfigStatus() {
        if (!this._view) {
            return;
        }

        const isConfigValid = await ConfigManager.isConfigValid(this._context);
        const xygeniUrl = ConfigManager.getXygeniUrl();

        this._view.webview.postMessage({
            type: 'configStatus',
            isConfigured: isConfigValid,
            xygeniUrl: xygeniUrl
        });
    }

    private async _runScan() {
        const isConfigValid = await ConfigManager.isConfigValid(this._context);
        if (!isConfigValid) {
            vscode.window.showWarningMessage(
                'Please configure Xygeni URL and token before running a scan.',
                'Open Configuration'
            ).then(selection => {
                if (selection === 'Open Configuration') {
                    vscode.commands.executeCommand('xygeni.openConfig');
                }
            });
            return;
        }

        vscode.window.showInformationMessage('Security scan functionality coming soon!');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xygeni Welcome</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 8px;
            margin: 0;
            line-height: 1.6;
        }
        
        .welcome-header {
            text-align: center;
            margin-bottom: 24px;
        }
        
        .logo {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            background: var(--vscode-button-background);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-button-foreground);
        }
        
        h1 {
            margin: 0 0 8px 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            margin: 0;
        }
        
        .status-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        }
        
        .status-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        
        .status-icon {
            width: 16px;
            height: 16px;
            border-radius: 50%;
        }
        
        .status-icon.configured {
            background-color: var(--vscode-testing-iconPassed);
        }
        
        .status-icon.not-configured {
            background-color: var(--vscode-problemsWarningIcon-foreground);
        }
        
        .status-title {
            font-weight: 600;
            margin: 0;
        }
        
        .status-description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin: 4px 0 0 0;
        }
        
        .quick-actions {
            margin-top: 24px;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 16px 0;
            color: var(--vscode-foreground);
        }
        
        .action-button {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            cursor: pointer;
            margin-bottom: 8px;
            transition: background-color 0.2s;
            text-decoration: none;
            color: var(--vscode-foreground);
        }
        
        .action-button:hover {
            background: var(--vscode-list-activeSelectionBackground);
        }
        
        .action-button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        
        .action-button.primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .action-icon {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            opacity: 0.8;
        }
        
        .action-content {
            flex: 1;
        }
        
        .action-title {
            font-weight: 500;
            margin: 0 0 2px 0;
        }
        
        .action-description {
            font-size: 12px;
            opacity: 0.8;
            margin: 0;
        }
        
        .divider {
            height: 1px;
            background: var(--vscode-panel-border);
            margin: 20px 0;
        }
        
        .footer {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 24px;
        }
    </style>
</head>
<body>
    <div class="welcome-header">
        <div class="logo">XY</div>
        <h1>Welcome to Xygeni</h1>
        <p class="subtitle">Secure your code with advanced security scanning</p>
    </div>
    
    <div class="status-card" id="statusCard">
        <div class="status-header">
            <div class="status-icon" id="statusIcon"></div>
            <h3 class="status-title" id="statusTitle">Checking configuration...</h3>
        </div>
        <p class="status-description" id="statusDescription">Please wait while we check your setup.</p>
    </div>
    
    <div class="quick-actions">
        <h2 class="section-title">Quick Actions</h2>
        
        <div class="action-button primary" id="configButton">
            <div class="action-icon">⚙️</div>
            <div class="action-content">
                <div class="action-title">Configure Xygeni</div>
                <div class="action-description">Set up your API URL and authentication token</div>
            </div>
        </div>
        
        <div class="action-button" id="scanButton" style="display: none;">
            <div class="action-icon">🔍</div>
            <div class="action-content">
                <div class="action-title">Run Security Scan</div>
                <div class="action-description">Scan your workspace for security issues</div>
            </div>
        </div>
        
        <div class="action-button" id="docsButton">
            <div class="action-icon">📚</div>
            <div class="action-content">
                <div class="action-title">Documentation</div>
                <div class="action-description">Learn more about Xygeni features</div>
            </div>
        </div>
    </div>
    
    <div class="divider"></div>
    
    <div class="footer">
        <p>Xygeni VSCode Extension v0.0.1</p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Button event listeners
        document.getElementById('configButton').addEventListener('click', () => {
            vscode.postMessage({ type: 'openConfig' });
        });
        
        document.getElementById('scanButton').addEventListener('click', () => {
            vscode.postMessage({ type: 'runScan' });
        });
        
        document.getElementById('docsButton').addEventListener('click', () => {
            vscode.postMessage({ type: 'openDocs' });
        });
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'configStatus':
                    updateConfigStatus(message.isConfigured, message.xygeniUrl);
                    break;
            }
        });
        
        function updateConfigStatus(isConfigured, xygeniUrl) {
            const statusIcon = document.getElementById('statusIcon');
            const statusTitle = document.getElementById('statusTitle');
            const statusDescription = document.getElementById('statusDescription');
            const scanButton = document.getElementById('scanButton');
            const configButton = document.getElementById('configButton');
            
            if (isConfigured) {
                statusIcon.className = 'status-icon configured';
                statusTitle.textContent = 'Ready to Scan';
                statusDescription.textContent = \`Connected to \${xygeniUrl || 'Xygeni API'}\`;
                scanButton.style.display = 'block';
                configButton.classList.remove('primary');
            } else {
                statusIcon.className = 'status-icon not-configured';
                statusTitle.textContent = 'Configuration Required';
                statusDescription.textContent = 'Please configure your Xygeni URL and authentication token to get started.';
                scanButton.style.display = 'none';
                configButton.classList.add('primary');
            }
        }
        
        // Request initial config status
        vscode.postMessage({ type: 'checkConfig' });
    </script>
</body>
</html>`;
    }
}