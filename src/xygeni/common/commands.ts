/* eslint-disable curly */
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import * as os from 'os';
import { ConfigManager, ProxySettings } from "../config/xygeni-configuration";
import { ISSUE_DETAILS_REMEDIATE_FUNCTION, ISSUE_DETAILS_SAVE_FUNCTION, STATUS, XYGENI_CONTEXT, XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from './constants';
import { EventEmitter } from 'vscode';
import { Commands, XyContext, ScanResult, IHttpClient, XygeniMedia, XygeniIssue } from './interfaces';
import InstallerService from '../service/installer';
import { Logger, OutputChannelWrapper } from './logger';
import XygeniScannerService from '../service/scanner';
import IssuesService from '../service/issues';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { XygeniMediaImpl } from './media';
import { HttpClientFactory } from './https';
import { ScanViewEmitter } from '../views/scan-view';
import { IssueViewEmitter } from '../views/issue-view';
import { ConfigurationViewEmitter } from '../views/configuration-view';
import { DetailsView } from '../views/details-view';
import { RemediationDiffContentProvider } from '../views/remediation-providers';
import LicenseService from '../service/license';
import { VulnXygeniIssue } from '../service/vuln-issue';
import { RemediationService } from '../service/remediation';
import { McpSetupView } from '../views/mcp-setup-view';



export class CommandsImpl implements Commands, ScanViewEmitter, IssueViewEmitter, ConfigurationViewEmitter {
  
  private static instance: CommandsImpl;

  private readonly wsLocalStoragePath: string; // unique to each workspace
  private readonly globalStoragePath: string;  // common to all workspaces
  private readonly xygeniMedia: XygeniMedia;
  private scanOutputChannel: OutputChannelWrapper | undefined;
  private remediationDiffProvider: RemediationDiffContentProvider | undefined;

  public static getInstance(context: vscode.ExtensionContext, xygeniContext: XyContext): CommandsImpl {
    if (!CommandsImpl.instance) {
      CommandsImpl.instance = new CommandsImpl(context, xygeniContext);
    }
    return CommandsImpl.instance;
  }

  /**
   * Constructor. Use workspace storage as working directory.
   */

  constructor(private readonly context: vscode.ExtensionContext, private readonly xygeniContext: XyContext) {
    if (this.context.storageUri === undefined) {
      // if no workspace storage availabele, use global storage and create a random folder each time a workspace is opened
      const path = this.context.globalStorageUri.fsPath + "/" + _.random(0, 1000);
      this.wsLocalStoragePath = path;
    }
    else {
      const path = this.context.storageUri.fsPath;
      this.wsLocalStoragePath = path;
    }
    this.globalStoragePath = this.context.globalStorageUri.fsPath;

    vscode.workspace.fs.createDirectory(vscode.Uri.file(this.globalStoragePath)); // ensure output directory is create before running scanner
    vscode.workspace.fs.createDirectory(vscode.Uri.file(this.wsLocalStoragePath)); // ensure output directory is create before running scanner

    //Logger.log(`Workspace storage path: ${this.wsLocalStoragePath}`);
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
      this.resetConnectionStatus();
    }
  }

  getXygeniUrl(): string | undefined {
    return ConfigManager.getXygeniUrl();
  }

  getToken(): Promise<string | undefined> {
    return ConfigManager.getXygeniToken(this.context);
  }

  isProxyEnabled(): boolean {
    return ProxyConfigManager.isProxyEnabled(this);
  }

  getProxySettings(): ProxySettings {
    return ConfigManager.getProxySettings();
  }

  getHttpClient(url: string): IHttpClient {
    return HttpClientFactory.getClient(url, this);
  }

  public async checkLicense(): Promise<boolean> {

    const xygeniToken = await ConfigManager.getXygeniToken(this.context);
    if (!xygeniToken) {
      Logger.log(' === No token available  ===');
      return false;
    }
    return LicenseService.getInstance().isValidLicense(xygeniToken).then(
      (isAvailable) => {
        this.updateLicenseIdeAvailability(isAvailable);
        Logger.log('==============================');
        Logger.log('    IDE License available     ');
        Logger.log('==============================');
        return isAvailable; 
      }
    )
      .catch(() => {
        this.updateLicenseIdeAvailability(false);
        return false; 
      });
  }

  /**
   * Refresh connection and run installer 
   * @param override if true, force installation even if scanner is already installed
   * @returns 
   */
  public async refreshAndInstall(override?: boolean): Promise<unknown> {

    const xygeniUrl = ConfigManager.getXygeniUrl();
    const xygeniToken = await ConfigManager.getXygeniToken(this.context);

    this.resetConnectionStatus();
    this.updateLicenseIdeAvailability(true); // consider a valid license is available by default until not checked

    if (!xygeniUrl || !xygeniToken) {
      throw new Error('Xygeni API URL and token are required');
    }
    try {
      // Validate URL format
      new URL(xygeniUrl);

      this.connecting();
      if (!await InstallerService.getInstance().isValidApiUrl(xygeniUrl)) {
        this.resetConnectionStatus();
        throw new Error('Xygeni API URL is not valid or not reachable.');
      }

      if (!await InstallerService.getInstance().isValidToken(xygeniUrl, xygeniToken)) {
        this.resetConnectionStatus();
        throw new Error('Xygeni Token not valid. Cannot connect to Xygeni API');
      }

      if (!await this.checkLicense()) {
        this.resetConnectionStatus();
        throw new Error('No Ide License available. Please contact administrator for more details.');
      }

      this.connectionReady();

      if (!override && await InstallerService.getInstance().isScannerInstalled()) {
        Logger.log('=== Xygeni Scanner already installed. ===');
        this.installerOk();
        this.setMcpLibraryInstalled();
        Logger.log(`=== MCP Library is ready. Check Xygeni MCP Setup to configure it. ===`);
        
        return Promise.resolve();
      }

      // if connection is ready, auto run installer
      return this.installScanner(override).then(() => {
        return Promise.resolve();
      });

    } catch (error: any) {
      Logger.error(error, "Error while opening Xygeni connection. ");
      vscode.window.showErrorMessage("Xygeni Connection Error: " + error.message);
      this.resetConnectionStatus();
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

  public getIssues(): XygeniIssue[] {
    return IssuesService.getInstance().getIssues();
  }

  public getIssuesByCategory(category: string): XygeniIssue[] {
    return IssuesService.getInstance().getIssuesByCategory(category);
  }

  public showIssueDetails(issue: any): void {
    DetailsView.showIssueDetails(issue, this);
  }

  public getDetectorDoc(url: URL, token: string): Promise<string> {
    return IssuesService.getInstance().getDetectorDoc(url, token);
  }

  setRemediationDiffProvider(remediationDiffProvider: RemediationDiffContentProvider) {
    this.remediationDiffProvider = remediationDiffProvider;
  }

  public saveRemediationChanges(fileUri: string): Promise<void> {
    if(this.remediationDiffProvider === undefined) {
      return Promise.resolve();
    }
    return this.remediationDiffProvider?.saveRemediationChanges(fileUri);
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

  public getMcpLibraryPath(): string | undefined {
    return InstallerService.getInstance().getMcpLibraryPath();
  }


  public getScanOutputChannel(): OutputChannelWrapper {
    if (this.scanOutputChannel === undefined) {
      this.scanOutputChannel = new OutputChannelWrapper(vscode.window.createOutputChannel(XYGENI_SCANNER_OUTPUT_NAME));
    }
    return this.scanOutputChannel;
  }

  showScanOutput() {    
    this.getScanOutputChannel().show();
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
    this.resetInstaller();


    const xygeniUrl = ConfigManager.getXygeniUrl();
    return ConfigManager.getXygeniToken(this.context).then(xygeniToken => {

      // Install scanner
      this.installing();

      installer.install(xygeniUrl, xygeniToken, override).then(() => {

        setTimeout(() => {
          this.installerOk(); 
          
          // Download MCP library
          installer.downloadMCPLibrary()
            .then(() => {
              this.setMcpLibraryInstalled();
              return Promise.resolve();
            })
            .catch((error) => {
              Logger.log(" Error downloading Xygeni MCP library. MCP Server will not be available: " + error);
            });

        }, 500); // allow user see transition

      }).catch((error) => {
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

    try {
      await scanner.runAnalysis(sourceFolder, this.getXygeniInstallPath(), this.getScanOutputChannel());
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
    return (vscode.workspace.workspaceFolders || []).map(f => f.uri.path);
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

  isInstallReady(): boolean {
    const isXygeniInstalled = this.xygeniContext.getKey(XYGENI_CONTEXT.INSTALL_READY);
    if(isXygeniInstalled) {
      return true;
    }
    return false;
  }

  showMcpSetupView() {
    void McpSetupView.showMcpSetup(this);
  }

  openDiffViewCommand(uri: string, tempFile: string): void {

    this.readFileFromRoot(tempFile)
    .then(
      (proposedText) => {
        if (this.remediationDiffProvider) {
            const previewUri =  this.remediationDiffProvider.getPreviewFixUri(uri);
          this.remediationDiffProvider.setContent(previewUri, proposedText);
          vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.parse(uri),
            vscode.Uri.parse(previewUri.toString()),
            'Xygeni Fix Preview',
            { viewColumn: vscode.ViewColumn.One }
          );
        }
      }
    );
    
  }

  

  // ========================================================
  // refresh views methods

  private _refreshConfigEventEmitter: EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly refreshConfigEventEmitter: vscode.Event<void> = this._refreshConfigEventEmitter.event;

  refreshConfigView = _.throttle((): void => this._refreshConfigEventEmitter.fire(), 1000, {
    leading: true,
  });

  private _refreshScannerEventEmitter: EventEmitter<void> = new EventEmitter<void>();
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

    // license not valid until checked
    this.xygeniContext.setKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE, true); // consider a valid license is available by default until not checked

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

  updateLicenseIdeAvailability(isAvailable: boolean): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE, isAvailable);
    this.refreshConfigView();
  }

  resetConnectionStatus(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTION_READY, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.CONNECTING, false);
    this.resetInstaller();
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
    this.resetInstaller();

    Logger.log("");
    Logger.log("=== Connection ready. Xygeni credentials are valid. ===");

    this.refreshAllViews();
  }

  resetInstaller(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_READY, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.INSTALL_ERROR, false);
    this.xygeniContext.setKey(XYGENI_CONTEXT.MCP_LIBRARY_INSTALLED, false);
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

  setMcpLibraryInstalled(): void {
    this.xygeniContext.setKey(XYGENI_CONTEXT.MCP_LIBRARY_INSTALLED, true);
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
      const fileUri: vscode.Uri = vscode.Uri.file(this.wsLocalStoragePath + "/" + filename);

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

  readFileFromRoot(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileUri: vscode.Uri = vscode.Uri.file(filepath);

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

  async fileExistsInProject(filename: string): Promise<boolean> {
    try {
      const fileUri = vscode.Uri.file(this.getWorkspaceFolders()[0] + "/" + filename);
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  async fileExists(filename: string): Promise<boolean> {
    try {
      const fileUri = vscode.Uri.file(this.wsLocalStoragePath + "/" + filename);
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  getAbsolutePathForSourceFile(filename: string): string {
    return this.getWorkspaceFolders()[0] + "/" + filename;
  }

  storeGlobalFile(filename: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileUri: vscode.Uri = vscode.Uri.file(this.globalStoragePath + "/" + filename);
      return vscode.workspace.fs.writeFile(fileUri, Buffer.from(content))
        .then(() => {
          return Promise.resolve();
        },
          (error: any) => {
            throw error; // Re-throw the error so the consumer can handle it
          });
    });
  }

  readGlobalFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileUri: vscode.Uri = vscode.Uri.file(this.globalStoragePath + "/" + filename);

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

  async globalFileExists(filename: string): Promise<boolean> {
    try {
      const fileUri = vscode.Uri.file(this.globalStoragePath + "/" + filename);
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  copyFileToFolder(fromFilePath: string, toFolder: string): Promise<string> {
   
    const sourceUri = vscode.Uri.file(fromFilePath);
    const toFile = toFolder + "/" + sourceUri.path.split('/').pop();
    
    return this.copyFile(fromFilePath, toFile);
  }

  copyFile(fromFilePath: string, toFilePath: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const sourceUri = vscode.Uri.file(fromFilePath);
        const destUri = vscode.Uri.file(toFilePath);

        // Read the source file
        const content = await vscode.workspace.fs.readFile(sourceUri);

        // Write to destination file
        await vscode.workspace.fs.writeFile(destUri, content);

        resolve(toFilePath);
      } catch (error: any) {
        reject(error);
      }
    });
  }

  getWsLocalStorage(): string {
    // the scanner will export reports using the suffix
    return this.wsLocalStoragePath;
  }

  // ========================================================
  // media

  getXygeniMedia(): XygeniMedia {
    return this.xygeniMedia;
  }

  getXygeniCss(): string {
    return this.xygeniMedia.getXygeniCss();
  }

  getIconPath(iconname: string): string {
    return this.xygeniMedia.getIconPath(iconname);
  }
  getExtensionPath(): string {
    return this.context.extensionPath;
  }
  getIconsPath(): string {
    return this.xygeniMedia.getIconsPath();
  }

}
