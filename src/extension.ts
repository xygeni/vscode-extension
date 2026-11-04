import * as vscode from 'vscode';
import XygeniExtension from './xygeni/extension';
import { CommandsImpl } from './xygeni/common/commands';
import { XyContextImpl } from './xygeni/common/context';
import { ConfigManager } from './xygeni/config/xygeni-configuration';

const extension = new XygeniExtension();

/** What `vscode.extensions.getExtension(...).exports` gives: used by the end-to-end tests to drive the extension. */
export interface XygeniExtensionApi {
	commands(): CommandsImpl;
	setXygeniUrl(url: string): Promise<void>;
	setToken(token: string): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): XygeniExtensionApi {
	console.log('Activating Xygeni Extension');
	void extension.activate(context);
	return {
		commands: () => CommandsImpl.getInstance(context, XyContextImpl.getInstance()),
		setXygeniUrl: (url) => ConfigManager.updateXygeniUrl(url),
		setToken: (token) => ConfigManager.setToken(token, context)
	};
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Deactivating Xygeni Extension');
	void extension.deactivate();
}
