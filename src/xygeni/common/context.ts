import * as vscode from 'vscode';
import { ILogger, XyContext } from "./interfaces";
import { Logger } from './logger';


export class XyContextImpl implements XyContext {

  private static instance: XyContextImpl;

  private static readonly PREFIX = 'xygeni:';

  private readonly logger: ILogger;

  readonly xyContext: { [key: string]: unknown };

  public static getInstance(): XyContextImpl {
    if (!XyContextImpl.instance) {
      XyContextImpl.instance = new XyContextImpl();
    }
    return XyContextImpl.instance;
  }

  constructor() {
    this.xyContext = {};
    this.logger = Logger;
  }

  async setKey(key: string, value: unknown): Promise<void> {
    this.xyContext[key] = value;
    await this.setViewsContext(key, value);
  }

  getKey(key: string): unknown {
    return this.xyContext[key];
  }

  // update context in all views
  private setViewsContext = async (key: string, value: unknown): Promise<void> => {
    await vscode.commands.executeCommand('setContext', `${XyContextImpl.PREFIX}${key}`, value);
  };
}