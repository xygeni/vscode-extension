import * as https from 'https';
import * as http from 'http';
import { IncomingMessage, ClientRequest } from 'http';
import { Logger } from './logger';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { IHttpClient } from './interfaces';

/**
 * HTTPS client wrapper
 */
class HttpsClient implements IHttpClient {

    private headers: Record<string, string> = {};

    setAuthToken(token: string): IHttpClient {
        const value = `Bearer ${token}`;
        this.headers['Authorization'] = value;
        this.headers['Content-Type'] = 'application/json';
        return this;
    }

    get(url: string, callback: (res: IncomingMessage) => void): ClientRequest {
        const options: https.RequestOptions = {
            headers: this.headers,
            timeout: 60000,
            rejectUnauthorized: true,
            agent: this.getAgent()
        };
        return https.get(url, options, callback);
    }

    post(url: string, data: any, callback: (res: IncomingMessage) => void): ClientRequest {
        const options: https.RequestOptions = {
            method: 'POST',
            headers: this.headers,
            timeout: 60000,
            rejectUnauthorized: true,
            agent: this.getAgent()
        };
        const req = http.request(url, options, callback);
        req.write(data);
        req.end();
        return req;
    }

    getAgent(): HttpsProxyAgent<string> | undefined {
        if (!ProxyConfigManager.isProxyEnabled()) {
            return undefined;
        }
        Logger.log(`Using proxy: ${ProxyConfigManager.buildProxyUrlWithAuthentication()}`);
        return new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication());
    }
}

/**
 * HTTP client wrapper
 */
class HttpClient implements IHttpClient {
    private headers: Record<string, string> = {};

    setAuthToken(token: string): IHttpClient {
        const value = `Bearer ${token}`;
        this.headers['Authorization'] = value;
        this.headers['Content-Type'] = 'application/json';
        return this;
    }

    get(url: string, callback: (res: IncomingMessage) => void): ClientRequest {
        const options: http.RequestOptions = {
            method: 'GET',
            headers: this.headers,
            timeout: 60000,
            agent: this.getAgent()
        };
        return http.get(url, options, callback);
    }

    post(url: string, data: any, callback: (res: IncomingMessage) => void): ClientRequest {
        const options: http.RequestOptions = {
            method: 'POST',
            headers: this.headers,
            timeout: 60000,
            agent: this.getAgent()
        };
        const req = http.request(url, options, callback);
        req.write(data);
        req.end();
        return req;
    }

    getAgent(): HttpsProxyAgent<string> | undefined {
        if (!ProxyConfigManager.isProxyEnabled()) {
            return undefined;
        }
        return new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication());
    }
}

/**
 * Factory class for creating HTTP/HTTPS clients
 * This provides a single point for mocking in tests
 */
export class HttpClientFactory {
    private static httpsClient: IHttpClient = new HttpsClient();
    private static httpClient: IHttpClient = new HttpClient();

    private static headers: Record<string, string> = {};

    /**
     * Get the appropriate client based on the URL protocol
     */
    static getClient(url: string): IHttpClient {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' ? this.httpsClient : this.httpClient;
    }

    /**
     * Set custom HTTPS client (primarily for testing)
     */
    static setHttpsClient(client: IHttpClient): void {
        this.httpsClient = client;
    }

    /**
     * Set custom HTTP client (primarily for testing)
     */
    static setHttpClient(client: IHttpClient): void {
        this.httpClient = client;
    }

    /**
     * Reset to default clients (useful for test cleanup)
     */
    static reset(): void {
        this.httpsClient = new HttpsClient();
        this.httpClient = new HttpClient();
    }
}

/**
 * Convenience function to get a client for a given URL
 */
export function getHttpClient(url: string): IHttpClient {
    return HttpClientFactory.getClient(url);
}

/**
 * Export the factory for direct access if needed
 */
export { HttpClientFactory as HttpFactory };
