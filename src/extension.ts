import * as vscode from 'vscode';
import XygeniExtension from './xygeni/extension';
import { CommandsImpl } from './xygeni/common/commands';
import { XyContextImpl } from './xygeni/common/context';
import { ConfigManager } from './xygeni/config/xygeni-configuration';

const extension = new XygeniExtension();

/**
 * What `vscode.extensions.getExtension(...).exports` gives to the end-to-end tests to drive the extension.
 * Only under the test host: any installed extension can read `exports`, and this API reads the token
 * (`commands().getToken()`) and redirects the server URL, so a normal or development host gets nothing.
 */
export interface XygeniExtensionApi {
	commands(): CommandsImpl;
	setXygeniUrl(url: string): Promise<void>;
	setToken(token: string): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): XygeniExtensionApi | undefined {
	console.log('Activating Xygeni Extension');
	void extension.activate(context);
	return testApi(context);
}

/** Exported for the unit test that pins the gate: `undefined` unless VS Code runs the extension tests. */
export function testApi(context: vscode.ExtensionContext): XygeniExtensionApi | undefined {
	if (context.extensionMode !== vscode.ExtensionMode.Test) { return undefined; }
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
