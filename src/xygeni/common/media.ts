import * as vscode from 'vscode';
import { readFileSync } from 'fs';

export interface XygeniMedia {
  getXygeniCss(): string
}

export class XygeniMediaImpl implements XygeniMedia {

  constructor(private readonly context: vscode.ExtensionContext) { }

  public getXygeniCss(): string {
    const stylePath = vscode.Uri.joinPath(
      vscode.Uri.file(this.context.extensionPath), 'media', 'css', 'xygeni.css');
    const style = readFileSync(stylePath.fsPath, 'utf8');
    return style;
  }
}