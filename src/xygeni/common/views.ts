import * as vscode from 'vscode';



export class EmptyTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      return this.getRootChildren();
    }
  }

  getRootChildren(): vscode.TreeItem[] {
    return [];
  }
}