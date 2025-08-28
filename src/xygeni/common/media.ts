import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { XygeniMedia } from './interfaces';



export class XygeniMediaImpl implements XygeniMedia {

  constructor(private readonly context: vscode.ExtensionContext) { }

  public getXygeniCss(): string {
    const stylePath = vscode.Uri.joinPath(
      vscode.Uri.file(this.context.extensionPath), 'media', 'css', 'xygeni.css');
    const style = readFileSync(stylePath.fsPath, 'utf8');
    return style;
  }

  getIconsPath(): string {
    const iconPath = vscode.Uri.joinPath(
      vscode.Uri.file(this.context.extensionPath), 'media', 'icons');
    return iconPath.fsPath;
  }

  getIconPath(iconName: string): string {
    const iconPath = vscode.Uri.joinPath(
      vscode.Uri.file(this.context.extensionPath), 'media', 'icons', iconName);
    return iconPath.fsPath;
  }
}