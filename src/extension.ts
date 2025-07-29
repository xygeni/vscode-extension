import * as vscode from 'vscode';
import XygeniExtension from './xygeni/extension';

const extension = new XygeniExtension();

export function activate(context: vscode.ExtensionContext) {
	console.log('Activating Xygeni Extension');
	void extension.activate(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Deactivating Xygeni Extension');
	void extension.deactivate();
}
