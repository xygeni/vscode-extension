import * as vscode from 'vscode';
import { GlobalContext } from '../common/interfaces';



export default class GlobalContextImpl implements GlobalContext {

  private static instance: GlobalContextImpl;
  private context: vscode.ExtensionContext | undefined;

  public static getInstance(context?: vscode.ExtensionContext): GlobalContextImpl {
    if (!GlobalContextImpl.instance) {
      if (!context) { throw new Error('VS Code extension context is not set.'); }
      GlobalContextImpl.instance = new GlobalContextImpl(context);
    }
    return GlobalContextImpl.instance;
  }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ===============================
  // Global context

  updateGlobalStateValue(key: string, value: unknown): Thenable<void> {
    return this.acquireContext().globalState.update(key, value);
  }

  getGlobalStateValue(key: string): unknown {
    return this.acquireContext().globalState.get(key);
  }

  getExtensionPath(): string {
    return this.acquireContext().extensionPath;
  }

  private acquireContext(): vscode.ExtensionContext {
    if (!this.context) { throw new Error('VS Code extension context is not set.'); }
    return this.context;
  }
}