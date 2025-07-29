import * as vscode from 'vscode';

export interface ProxySettings {
    protocol?: string;
    host?: string;
    port?: number;
    authentication?: string;
    username?: string;
    password?: string;
    nonProxyHosts?: string;
}

export class ProxyConfigManager {

    private static readonly PROXY_CONFIG_SECTION = 'xygeni.proxy';

    public static getProxySettings(): ProxySettings {
        const config = vscode.workspace.getConfiguration(this.PROXY_CONFIG_SECTION);
        return {
            protocol: config.get('protocol'),
            host: config.get('host'),
            port: config.get('port'),
            authentication: config.get('authentication'),
            username: config.get('username'),
            password: config.get('password'),
            nonProxyHosts: config.get('nonProxyHosts')
        };
    }

    public static isProxyEnabled(): boolean {
        const proxySettings = this.getProxySettings();
        return !!proxySettings.host;
    }

    public static buildProxyUrlWithAuthentication(): string {
        const proxySettings = this.getProxySettings();
        // if username and password are not set, return the proxy url without authentication
        if (!proxySettings.username || !proxySettings.password) {
            return `${proxySettings.protocol}://${proxySettings.host}:${proxySettings.port}`;
        }
        const proxyUrl = `${proxySettings.protocol}://${proxySettings.username}:${proxySettings.password}@${proxySettings.host}:${proxySettings.port}`;
        return proxyUrl;
    }
}
