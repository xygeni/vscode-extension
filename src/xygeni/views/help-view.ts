import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class HelpView {
    public static readonly viewType = 'xygeni.views.help';

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,


    ) {
        // get nonce
        const nonce = this.getNonce();

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true
        };
        webviewView.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta http-equiv="Content-Security-Policy" content="style-src 'self' 'nonce-${nonce}';" />            
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Xygeni Help</title>
            <style nonce=${nonce}>
                body {
                    padding: 2px;
                    margin: 0;
                    line-height: 1.6;
                    height: 20vh;
                }                
                .help-content {
                    margin: 10 auto;
                }
            </style>
        </head>
        <body>
            <div class="help-content">
                <p>For more information, visit <a href="https://docs.xygeni.io">https://docs.xygeni.io</a></p>
                <p>See Xygeni output channel for more details. <a href="command:xygeni.showOutput">Show Output</a></p>
                <p>Are you using a proxy?. <a href="command:xygeni.openProxyConfig">Proxy Configuration</a></p>

            </div>
        </body>
        </html>`;
    }


    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

}