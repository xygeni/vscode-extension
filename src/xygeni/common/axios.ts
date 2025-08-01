import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IncomingMessage, ClientRequest } from 'http';
import { Logger } from './logger';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IHttpClient } from './interfaces';



/**
 * Axios client wrapper
 */
export class AxiosClient2 implements IHttpClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    let httpsAgent;

    this.axiosInstance = axios.create({
      timeout: 60000,
      httpsAgent: httpsAgent
    });
  }

  setAuthToken(token: string): IHttpClient {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return this;
  }

  get(url: string, callback: (res: IncomingMessage) => void): ClientRequest {
    Logger.log("using proxy " + ProxyConfigManager.buildProxyUrlWithAuthentication());
    const request = this.axiosInstance.get(url, {
      responseType: 'stream',
      httpsAgent: new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication()),
      httpAgent: new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication()),
      proxy: false
    });
    this.handleRequest(request, callback);
    // This is not a real ClientRequest, but it's enough for the current usage
    return {
      on: (event: string, listener: (...args: any[]) => void) => {
        if (event === 'error') {
          request.catch(listener);
        }
      }
    } as ClientRequest;
  }

  post(url: string, data: any, callback: (res: IncomingMessage) => void): ClientRequest {

    Logger.log("using proxy " + ProxyConfigManager.buildProxyUrlWithAuthentication());
    const request = this.axiosInstance.post(url, data, {
      responseType: 'stream',
      httpsAgent: new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication()),
      httpAgent: new HttpsProxyAgent(ProxyConfigManager.buildProxyUrlWithAuthentication()),
      proxy: false
    });
    this.handleRequest(request, callback);
    // This is not a real ClientRequest, but it's enough for the current usage
    return {
      on: (event: string, listener: (...args: any[]) => void) => {
        if (event === 'error') {
          request.catch(listener);
        }
      }
    } as ClientRequest;
  }

  private handleRequest(request: Promise<any>, callback: (res: IncomingMessage) => void) {
    request.then(response => {
      callback(response.data as IncomingMessage);
    }).catch(error => {
      Logger.error(error, `Axios request failed`);
    });
  }
}

