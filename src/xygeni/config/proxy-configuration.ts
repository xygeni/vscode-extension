import { Commands } from "../common/interfaces";



export class ProxyConfigManager {


    public static isProxyEnabled(commands: Commands): boolean {
        const proxySettings = commands.getProxySettings();
        return !!proxySettings.host;
    }

    public static buildProxyUrlWithAuthentication(commands: Commands): string {
        const proxySettings = commands.getProxySettings();
        if (!proxySettings.host) {
            return '';
        }
        if (!proxySettings.username || !proxySettings.password) {
            return `${proxySettings.protocol}://${proxySettings.host}:${proxySettings.port}`;
        }
        const proxyUrl = `${proxySettings.protocol}://${proxySettings.username}:${proxySettings.password}@${proxySettings.host}:${proxySettings.port}`;
        return proxyUrl;
    }
}
