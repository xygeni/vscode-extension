import * as vscode from 'vscode';

export interface XygeniConfig {
    xygeniUrl: string;
    xygeniToken: string;
}

export class ConfigManager {

    private static readonly XYGENI_CONFIG_SECTION = 'xygeni.api';
    private static readonly XYGENI_DEFAULT_API_URL = 'https://api.xygeni.io';
    private static readonly XYGENI_URL_PROP_NAME = 'xygeniUrl';
    private static readonly XYGENI_TOKEN_SECRET_NAME = 'xygeniToken';



    /**
     * Check if the configuration is valid (both URL and token are provided)
     */
    public static async isConfigValid(context: vscode.ExtensionContext): Promise<boolean> {
        const xygeniUrl = this.getXygeniUrl();
        const xygeniToken = await this.getXygeniToken(context);
        return !!(xygeniUrl && xygeniToken);
    }

    /**
     * Update the entire configuration
     */
    public static async updateXygeniUrl(xygeniUrl: string): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.XYGENI_CONFIG_SECTION);
        await config.update(this.XYGENI_URL_PROP_NAME, xygeniUrl, vscode.ConfigurationTarget.Global);

    }

    /**
     * Update the entire configuration
     */
    public static async updateFullConfig(newConfig: XygeniConfig, context: vscode.ExtensionContext): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.XYGENI_CONFIG_SECTION);
        await config.update(this.XYGENI_URL_PROP_NAME, newConfig.xygeniUrl, vscode.ConfigurationTarget.Global);
        await this.setToken(newConfig.xygeniToken, context);
    }

    /**
     * Get the xygeni URL with validation
     */
    public static getXygeniUrl(): string | undefined {
        const config = vscode.workspace.getConfiguration(this.XYGENI_CONFIG_SECTION);

        const url = config.get(this.XYGENI_URL_PROP_NAME);
        if (!url) {
            return this.XYGENI_DEFAULT_API_URL;
        }

        try {
            new URL(url);
            return config.get(this.XYGENI_URL_PROP_NAME);
        } catch {
            return this.XYGENI_DEFAULT_API_URL;
        }
    }

    /**
     * Get the authentication token
     */
    public static getXygeniToken(context: vscode.ExtensionContext): Promise<string | undefined> {
        return new Promise(resolve => {
            context.secrets.get(this.XYGENI_TOKEN_SECRET_NAME)
                .then(token => resolve(token));
        });
    }

    public static async setToken(token: string | undefined, context: vscode.ExtensionContext): Promise<void> {
        if (!token) {
            return;
        }
        return await context.secrets.store(this.XYGENI_TOKEN_SECRET_NAME, token);
    }


    /**
     * Show configuration prompt if config is invalid
     */
    public static async promptConfigurationIfNeeded(context: vscode.ExtensionContext): Promise<boolean> {
        if (await this.isConfigValid(context)) {
            return true;
        }

        const result = await vscode.window.showWarningMessage(
            'Xygeni extension is not configured. Please set up the Xygeni URL and Xygeni token.',
            'Open Xygeni Configuration',
            'Cancel'
        );

        if (result === 'Open Xygeni Configuration') {
            vscode.commands.executeCommand('xygeni.showConfig');
        }

        return false;
    }

}
