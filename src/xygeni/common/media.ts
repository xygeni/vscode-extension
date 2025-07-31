import * as vscode from 'vscode';
import { readFileSync } from 'fs';

export interface XygeniMedia {
  getIconPath(iconname: string): string | vscode.IconPath;
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

  getIconPath(iconName: string): string | vscode.IconPath {
    const iconPath = vscode.Uri.joinPath(
      vscode.Uri.file(this.context.extensionPath), 'media', 'icons', iconName);
    return iconPath;
  }
}