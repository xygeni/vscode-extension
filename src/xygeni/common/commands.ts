import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import { ConfigManager } from "../config/xygeni-configuration";
import { STATUS, XYGENI_CONTEXT, XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from './constants';
import { EventEmitter } from 'vscode';
import { Commands, XyContext, ScanResult, WorkspaceFiles } from './interfaces';
import InstallerService from '../service/installer';
import { Logger, OutputChannelWrapper } from './logger';
import XygeniScannerService from '../service/scanner';
import IssuesService from '../service/issues';
import { AbstractXygeniIssue } from '../service/abstract-issue';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { XygeniMedia, XygeniMediaImpl } from './media';
import path from 'path';



export class CommandsImpl implements Commands, WorkspaceFiles {

  private static instance: CommandsImpl;

  private readonly wsLocalStorage: string;
  private readonly xygeniMedia: XygeniMedia;
  private outputChannel: OutputChannelWrapper | undefined;

  public static getInstance(context: vscode.ExtensionContext, xygeniContext: XyContext): CommandsImpl {
    if (!CommandsImpl.instance) {
      CommandsImpl.instance = new CommandsImpl(context, xygeniContext);
    }
    return CommandsImpl.instance;
  }

  constructor(private readonly context: vscode.ExtensionContext, private readonly xygeniContext: XyContext) {
    if (this.context.storageUri === undefined) {
      // use random folder
      const path = this.context.globalStorageUri.fsPath + "/" + _.random(0, 1000);
      this.wsLocalStorage = path;
    }
    else {
      const path = this.context.storageUri.fsPath;
      this.wsLocalStorage = path;
    }
    vscode.workspace.fs.createDirectory(vscode.Uri.file(this.wsLocalStorage)); // ensure output directory is create before running scanner
    //Logger.log("Scanner output path: " + this.wsLocalStorage);

    this.xygeniMedia = new XygeniMediaImpl(this.context);

  }

  // ============================================================================
  // Configuration Command handlers
  // ==========================================================================

  // Edit Xygeni Api URL config field
  public async editUrl(): Promise<void> {
    const currentUrl = ConfigManager.getXygeniUrl();
    const newUrl = await vscode.window.showInputBox({
      prompt: 'Enter Xygeni URL',
      value: currentUrl || '',
      placeHolder: 'https://api.xygeni.io',
      validateInput: (value: string) => {
        if (!value) {
          return 'URL is required';
        }
        try {
          new URL(value);
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    });

    if (newUrl !== undefined) {
      ConfigManager.updateXygeniUrl(newUrl);
      vscode.window.showInformationMessage('Xygeni API URL updated successfully');
      this.refreshAllViews();
    }
  }

  // Edit Xygeni Token config field
  public async editToken(): Promise<void> {
    const newToken = await vscode.window.showInputBox({
      prompt: 'Enter Xygeni Authentication Token',
      password: true,
      placeHolder: 'Enter your authentication token',
      validateInput: (value: string) => {
        if (!value) {
          return 'Token is required';
        }
        return null;
      }
    });

    if (newToken !== undefined) {
      await ConfigManager.setToken(newToken, this.context);

      vscode.window.showInformationMessage('Xygeni Token updated successfully');
      this.connectionChanged();
    }
  }


  /**
   * Check connection to Xygeni
   * @returns 
   */
  public async testConnection(override?: boolean): Promise<unknown> {

    const xygeniUrl = ConfigManager.getXygeniUrl();
    const xygeniToken = await ConfigManager.getXygeniToken(this.context);

    this.connectionChanged();

    if (!xygeniUrl || !xygeniToken) {
      throw new Error('Xygeni API URL and token are required');
    }
    try {
      // Validate URL format
      new URL(xygeniUrl);

      this.connecting();
      if (!await InstallerService.isValidApiUrl(xygeniUrl)) {
        this.connectionChanged();
        throw new Error('Xygeni API URL is not valid or not reachable.');
      }

      if (!await InstallerService.isValidToken(xygeniUrl, xygeniToken)) {
        this.connectionChanged();
        throw new Error('Xygeni Token not valid. Cannot connect to Xygeni API');
      }

      this.connectionReady();

      // if connection is ready, auto run installer
      return this.installScanner(override).then(() => {
        return Promise.resolve();
      });

    } catch (error: any) {
      Logger.error(error, "Error testing connection. ");
      vscode.window.showErrorMessage("Error testing connection");
      this.connectionChanged();
      return Promise.reject(error.message);
    }
  }

  public openProxySettings(): void {
    Logger.log("Opening proxy settings...");
    vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.context.extension.id}`);
  }

  // ============================================================================
  // Issue Commands 
  // ==========================================================================

  public getIssues(): AbstractXygeniIssue[] {
    return IssuesService.getInstance().getIssues();
  }

  public getIssuesByCategory(category: string): AbstractXygeniIssue[] {
    return IssuesService.getInstance().getIssuesByCategory(category);
  }

  public showIssueDetails(issue: AbstractXygeniIssue): void {
    issue.showIssueDetails(this);
  }


  // ============================================================================
  // Scanner Command handlers
  // ==========================================================================


  public getScans(): ScanResult[] {
    return XygeniScannerService.getInstance().getScans();
  }

  public getScannerInstallationDir(): string {
    return InstallerService.getInstance().getScannerInstallationDir();
  }

  /**
   * Run Installer of Xygeni Scanner 
   * @returns 
   */
  public async installScanner(override?: boolean): Promise<unknown> {

    const installer = InstallerService.getInstance();
    if (installer.installationRunning) {
      return {
        message: 'Installing... Please wait',
        status: STATUS.RUNNING
      };
    }
    this.initInstaller();


    const xygeniUrl = ConfigManager.getXygeniUrl();
    return ConfigManager.getXygeniToken(this.context).then(xygeniToken => {

      this.installing();
      installer.install(xygeniUrl, xygeniToken, override).then(() => {
        setTimeout(() => {
          this.installerOk();
        }, 500); // allow user see transition

      }
      ).catch((error) => {
        setTimeout(() => {
          this.installerError();
        }, 500); // allow user see transition
      });
    });
  }

  /**
   * Run Xygeni Scanner 
   * @returns 
   */
  public async runScanner(): Promise<void> {
    const scanner = XygeniScannerService.getInstance();
    if (scanner.isScannerRunning()) {
      vscode.window.showInformationMessage('Scanner already running...');
      return;
    }
    this.initScannerRun();

    // TODO: works with multiple workspace folders and trusted
    const sourceFolder = this.getWorkspaceFolders()[0];


    if (!this.outputChannel) {
      this.outputChannel = new OutputChannelWrapper(vscode.window.createOutputChannel(XYGENI_SCANNER_OUTPUT_NAME));
    }

    try {
      await scanner.run(sourceFolder, this.getXygeniInstallPath(), this.outputChannel);
      this.readIssues();
      this.refreshAllViews();
    } catch (error) {
      Logger.error(error, "Error running scanner");
      this.noIssuesAvailable();
    }
  }

  public readIssues = _.throttle(
    () => {
      IssuesService.getInstance().readIssues();
    },
    2000,
    { leading: false, trailing: true }
  );

  private getXygeniInstallPath(): string {
    return InstallerService.getInstance().getScannerInstallationDir();
  }

  private getWorkspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
  }


  // ========================================================
  // views commands

  showWelcomeView(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.WELCOME, true);
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, false);
    this.refreshConfigView();
  }
  showConfigView(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.WELCOME, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, true);
    this.refreshConfigView();
  }

  closeConfigView(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, false);
    this.refreshConfigView();
  }

  showIssuesView(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.SCANNER_RESULTS, true);
    this.refreshScannerView();
  }

  closeIssuesView(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.SCANNER_RESULTS, false);
    this.refreshScannerView();
  }

  // ========================================================
  // refresh views methods

  private _refreshConfigEventEmitter: EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly refreshConfigEventEmitter: vscode.Event<void> = this._refreshConfigEventEmitter.event;

  refreshConfigView = _.throttle((): void => this._refreshConfigEventEmitter.fire(), 1000, {
    leading: true,
  });

  private _refreshScannerEventEmitter: EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly refreshScannerEventEmitter: vscode.Event<void> = this._refreshScannerEventEmitter.event;

  refreshScannerView = _.throttle((): void => this._refreshScannerEventEmitter.fire(), 1000, {
    leading: true,
  });

  private _refreshIssuesEventEmitter: EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly refreshIssuesEventEmitter: vscode.Event<void> = this._refreshIssuesEventEmitter.event;

  refreshIssuesView = _.throttle((): void => this._refreshIssuesEventEmitter.fire(), 1000, {
    leading: true,
  });

  // allow actions to refresh views
  refreshAllViews(): void {
    this.refreshConfigView();
    this.refreshScannerView();
    this.refreshIssuesView();
  }

  // ========================================================
  // state

  public initState(): Promise<void> {

    // show welcome
    this.xygeniContext.setKey(XYGENI_CONTEXT.WELCOME, true);

    // is a workspace is opened
    this.xygeniContext.setKey(XYGENI_CONTEXT.WORKSPACE_FOUND, !!this.getWorkspaceFolders().length);

    // is xygeni config shown
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, false);

    // is xygeni api available
    this.xygeniContext.setKey(XYGENI_CONTEXT.API_ERROR, false);

    // is any error installing the scanner
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTION_READY, false);

    // is any error installing the scanner
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_ERROR, false);

    // if scanner is installed and ready to run
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_READY, false);

    // when issues are available
    this.xygeniContext.setKey(XYGENI_CONTEXT.SCANNER_RESULTS, false);

    return Promise.resolve();

  }

  connectionChanged(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTION_READY, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTING, false);
    this.initInstaller();
    this.refreshAllViews();
  }

  connecting(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTING, true);
    this.refreshAllViews();
    Logger.showOutput();
  }

  connectionReady(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTING, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTION_READY, true);
    this.initInstaller();

    Logger.log("");
    Logger.log(" === Connection ready. Xygeni credentials are valid. ===");

    this.refreshAllViews();
  }

  initInstaller(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_READY, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_ERROR, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, true); // show config

    this.refreshAllViews();
  }

  installing(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALLING, true);
    this.refreshAllViews();
  }

  installerOk(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALLING, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_ERROR, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_READY, true);
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, false); // hide config
    this.refreshAllViews();
  }

  installerError(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALLING, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_ERROR, true);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_READY, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.SHOW_CONFIG, true); // show config
    this.refreshAllViews();
  }

  initScannerRun(): void {

  }

  issuesAvailable(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.SCANNER_RESULTS, true);
    this.refreshAllViews();
  }

  noIssuesAvailable(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.SCANNER_RESULTS, false);
    this.refreshAllViews();
  }

  // ========================================================
  // workspace xygeni files storage

  storeFile(filename: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileUri: vscode.Uri = vscode.Uri.file(this.getWsLocalStorage() + "/" + filename);
      return vscode.workspace.fs.writeFile(fileUri, Buffer.from(content))
        .then(() => {

          return Promise.resolve();
        },
          (error: any) => {

            throw error; // Re-throw the error so the consumer can handle it
          });
    });
  }

  readFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileUri: vscode.Uri = vscode.Uri.file(this.wsLocalStorage + "/" + filename);

      return vscode.workspace.fs.readFile(fileUri)
        .then((content: Uint8Array) => {
          // Decode the Uint8Array to a string (assuming UTF-8 encoding)

          return resolve(new TextDecoder('utf-8').decode(content));
        },
          (error: any) => {

            throw error; // Re-throw the error so the consumer can handle it
          });
    });
  }

  async fileExists(filename: string): Promise<boolean> {
    try {
      const fileUri = vscode.Uri.file(this.wsLocalStorage + "/" + filename);
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  getWsLocalStorage(): string {
    // the scanner will export reports using the suffix
    return this.wsLocalStorage;
  }

  // ========================================================
  // media

  getXygeniMedia(): XygeniMedia {
    return this.xygeniMedia;
  }

  getXygeniCss(): string {
    return this.xygeniMedia.getXygeniCss();
  }

  getIconPath(iconname: string): string | vscode.IconPath {
    return this.xygeniMedia.getIconPath(iconname);
  }

}