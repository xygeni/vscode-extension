/* eslint-disable curly */
import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager, ProxySettings } from "../config/xygeni-configuration";
import { ISSUE_DETAILS_REMEDIATE_FUNCTION, ISSUE_DETAILS_SAVE_FUNCTION, MCP_RESTART_NOTE, STATE_MCP_IGNORED_VERSION, STATE_MCP_RESTART_PENDING, STATUS, XYGENI_CONTEXT, XYGENI_PRICING_URL, XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from './constants';
import { EventEmitter } from 'vscode';
import { Commands, ConfigurationViewEmitter, IHttpClient, McpStatus, ScanResult, ScanViewEmitter, XyContext, XygeniIssue, XygeniMedia } from './interfaces';
import InstallerService from '../service/installer';
import { Logger, OutputChannelWrapper } from './logger';
import XygeniScannerService from '../service/scanner';
import IssuesService from '../service/issues';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { XygeniMediaImpl } from './media';
import { HttpClientFactory } from './https';
import { IssueViewEmitter } from '../views/issue-view';
import { DetailsView } from '../views/details-view';
import { RemediationDiffContentProvider } from '../views/remediation-providers';
import LicenseService from '../service/license';
import LicenseStateService from '../service/license-state';
import { VulnXygeniIssue } from '../service/vuln-issue';
import { RemediationService } from '../service/remediation';
import { McpSetupView } from '../views/mcp-setup-view';
import GlobalContextImpl from '../service/global-context';
import { ScanConfig, ScanType, SCANNERS, defaultScanConfig, excludePatternForFolder, loadScanConfig, saveScanConfig, scanConfigPath, serializeScanConfig, withAllScanTypes, withDefaultOnSave, withExclude, withOnSaveType, withScanOption, withScanType, withoutExclude, withoutScanOption } from '../service/scan-config';
import { SCAN_OPTIONS, validateScanOption } from '../service/scan-options';
import { INSECURE_HTTP_WARNING, insecureUrlProblem, isInsecureRemoteUrl } from './insecure-url';



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
      async (isAvailable) => {
        this.updateLicenseIdeAvailability(isAvailable);
        if (isAvailable) {
          Logger.log('==============================');
          Logger.log('    IDE License available     ');
          Logger.log('==============================');
          await this.refreshLicenseType(xygeniToken);
        } else {
          await this.updateLicenseFree(false);
        }
        return isAvailable;
      }
    )
      .catch(async () => {
        this.updateLicenseIdeAvailability(false);
        await this.updateLicenseFree(false);
        return false;
      });
  }

  private async refreshLicenseType(token: string): Promise<void> {
    const stateService = LicenseStateService.getInstance(Logger, this);
    await stateService.refresh(token);
    const isFree = stateService.isFreeLicense();
    if (isFree) {
      Logger.log('Xygeni Free edition detected. Auto Scan on Save is disabled.');
    }
    await this.updateLicenseFree(isFree);
  }

  private async updateLicenseFree(isFree: boolean): Promise<void> {
    await this.xygeniContext.setKey(XYGENI_CONTEXT.LICENSE_FREE, isFree);
    this.refreshConfigView();
  }

  /**
   * A backend that is starting (a local one, a deploy) answers 5xx or refuses the connection for a few seconds:
   * the ping is retried before the extension calls it disconnected, so the user does not have to reconnect by hand.
   */
  private async pingWithRetries(xygeniUrl: string, attempts = 3, delayMs = 3000): Promise<boolean> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (await InstallerService.getInstance().isValidApiUrl(xygeniUrl)) { return true; }
        return false;
      } catch (error: any) {
        const message = String(error?.message ?? error);
        const transient = /: 5\d\d\b/.test(message) || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message);
        Logger.log(`Connection check failed (${attempt}/${attempts}): ${message}`);
        if (!transient || attempt === attempts) { throw error; }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  // False until the first connection check of this session ends, so the Configuration view shows "Connecting…"
  // rather than "Disconnected" while the check is still in flight.
  private connectionChecked = false;

  public isConnectionChecked(): boolean {
    return this.connectionChecked;
  }

  /**
   * Refresh connection and run installer 
   * @param override if true, force installation even if scanner is already installed
   * @returns 
   */
  public async refreshAndInstall(override?: boolean): Promise<unknown> {
    try {
      return await this.doRefreshAndInstall(override);
    } finally {
      this.connectionChecked = true;
      this.refreshConfigView();
    }
  }

  private async doRefreshAndInstall(override?: boolean): Promise<unknown> {

    const xygeniUrl = ConfigManager.getXygeniUrl();
    const xygeniToken = await ConfigManager.getXygeniToken(this.context);

    this.resetConnectionStatus();
    this.updateLicenseIdeAvailability(false); // fail-closed: only set to true after checkLicense() confirms a valid seat

    if (!xygeniUrl || !xygeniToken) {
      throw new Error('Xygeni API URL and token are required');
    }
    try {
      // Validate URL format
      new URL(xygeniUrl);

      // An http URL to a non-loopback host sends the token in clear: refused unless the user allowed it (#1438).
      const insecureProblem = insecureUrlProblem(xygeniUrl, ConfigManager.getAllowInsecureHttp());
      if (insecureProblem) {
        this.resetConnectionStatus();
        throw new Error(insecureProblem);
      }
      this.insecureHttp = isInsecureRemoteUrl(xygeniUrl);
      if (this.insecureHttp) {
        Logger.log(`WARNING: ${INSECURE_HTTP_WARNING} (${xygeniUrl}). Allowed by the "Allow insecure HTTP" setting.`);
      }

      this.connecting();
      if (!await this.pingWithRetries(xygeniUrl)) {
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
        // The scanner being installed says nothing about the MCP library: it lives in its own shared folder.
        this.installMcpLibrary(false);

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

  /**
   * Open the Xygeni pricing page in the default browser so Free-edition users can upgrade
   * their plan to unlock features such as Auto Scan on Save.
   */
  public openUpgradePage(): void {
    Logger.log(`Opening Xygeni pricing page: ${XYGENI_PRICING_URL}`);
    vscode.env.openExternal(vscode.Uri.parse(XYGENI_PRICING_URL));
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

  public getMcpStatus(): McpStatus {
    const installer = InstallerService.getInstance();
    const lastCheck = installer.lastMcpUpdateCheck;
    const restartPending = GlobalContextImpl.getInstance().getGlobalStateValue(STATE_MCP_RESTART_PENDING);
    return {
      installedVersion: installer.getMcpInstalledVersion(),
      availableVersion: lastCheck?.available,
      updateAvailable: lastCheck?.updateAvailable,
      updateMode: ConfigManager.getMcpUpdateMode(),
      restartPending: typeof restartPending === 'string' && restartPending.length > 0 ? restartPending : undefined
    };
  }

  /** The user restarted (or never had running) the MCP client: the "restart pending" note goes away. */
  public async dismissMcpRestart(): Promise<void> {
    await GlobalContextImpl.getInstance().updateGlobalStateValue(STATE_MCP_RESTART_PENDING, undefined);
    this.refreshConfigView();
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

          // Download MCP library; a reinstall (override) also refreshes it
          this.installMcpLibrary(override === true);

        }, 500); // allow user see transition

      }).catch((error) => {
        setTimeout(() => {
          this.installerError();
        }, 500); // allow user see transition
      });
    });
  }

  /** True while the configured URL is http to a non-loopback host and the user allowed it: the status keeps warning. */
  private insecureHttp = false;

  public isInsecureHttp(): boolean {
    return this.insecureHttp;
  }

  /**
   * Run Xygeni Scanner: the configured full scan, or with `only` just those scan types (the play button of a
   * results view), refreshing only their findings.
   * @returns
   */
  public async runScanner(only?: ScanType[]): Promise<void> {
    if (!this.isLicenseAvailable()) {
      Logger.log('Xygeni IDE License is not available. Scan aborted.');
      vscode.window.showWarningMessage('Xygeni IDE License is not available. Please contact your administrator.');
      return;
    }
    const scanner = XygeniScannerService.getInstance();
    if (scanner.isScannerRunning()) {
      vscode.window.showInformationMessage('Scanner already running...');
      return;
    }
    this.initScannerRun();

    // TODO: works with multiple workspace folders and trusted
    const sourceFolder = this.getWorkspaceFolders()[0];

    try {
      scanner.setScanConfig(this.getScanConfig());
      const types = only && only.length > 0 ? this.withCompanions(only) : undefined;
      await scanner.runAnalysis(sourceFolder, this.getXygeniInstallPath(), this.getScanOutputChannel(), types);
      // Only the configured scan types ran: their reports are re-read and the other categories are dropped (#415).
      // A single scan type keeps the findings of the others.
      this.readIssues(types ?? scanner.getFullScanTypes(), types !== undefined);
      this.refreshAllViews();
    } catch (error) {
      Logger.error(error, "Error running scanner");
      this.noIssuesAvailable();
    }
  }

  /** The scan types plus the ones that run with them (SCA brings suspect dependencies). */
  private withCompanions(types: ScanType[]): ScanType[] {
    const all = new Set(types);
    for (const scanner of SCANNERS) {
      if (scanner.runsWith && all.has(scanner.runsWith)) { all.add(scanner.key); }
    }
    return SCANNERS.map(scanner => scanner.key).filter(type => all.has(type));
  }

  // ============================================================================
  // Per-project scan configuration (.xygeni/ide.json, xygeni/xygeni-product-backlog#415)
  // ==========================================================================

  /** The configuration of the first workspace folder; the defaults without a workspace. */
  public getScanConfig(): ScanConfig {
    return loadScanConfig(this.getWorkspaceFolders()[0]);
  }

  public getScanConfigPath(): string | undefined {
    const root = this.getWorkspaceFolders()[0];
    return root ? scanConfigPath(root) : undefined;
  }

  private saveScanConfig(config: ScanConfig): void {
    const root = this.getWorkspaceFolders()[0];
    if (!root) {
      vscode.window.showWarningMessage('Open a workspace folder to configure its Xygeni scan.');
      return;
    }
    try {
      saveScanConfig(root, config);
      XygeniScannerService.getInstance().setScanConfig(config);
    } catch (error: any) {
      Logger.error(error, 'Error saving the scan configuration');
      vscode.window.showErrorMessage(`Could not save the Xygeni scan configuration: ${error.message}`);
    }
    this.refreshConfigView();
  }

  public toggleScanType(type: ScanType, enabled?: boolean): void {
    const config = this.getScanConfig();
    this.saveScanConfig(withScanType(config, type, enabled ?? !config.scans.includes(type)));
  }

  public toggleOnSaveScanType(type: ScanType, enabled?: boolean): void {
    const config = this.getScanConfig();
    const next = withOnSaveType(config, type, enabled ?? !config.onSave.includes(type));
    this.saveScanConfig(next);
    // The on-save column and Auto Scan on Save help each other (#415): switching a type on turns Auto Scan on
    // Save on; switching the last one off turns it off, as nothing would run on save.
    if (next.onSave.includes(type) && !ConfigManager.getAutoScan() && !this.isLicenseFree()) {
      void ConfigManager.setAutoScan(true).then(() => this.refreshAllViews());
    } else if (next.onSave.length === 0 && ConfigManager.getAutoScan()) {
      void ConfigManager.setAutoScan(false).then(() => this.refreshAllViews());
    }
  }

  public setAllScanTypes(enabled: boolean): void {
    this.saveScanConfig(withAllScanTypes(this.getScanConfig(), enabled));
  }

  public restoreScanDefaults(): void {
    this.saveScanConfig(defaultScanConfig());
  }

  /** Picks a folder of the workspace and excludes everything under it (`<folder>/**`). */
  public async addExcludeFolder(): Promise<void> {
    const root = this.getWorkspaceFolders()[0];
    if (!root) {
      vscode.window.showWarningMessage('Open a workspace folder to configure its Xygeni scan.');
      return;
    }
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: true, defaultUri: vscode.Uri.file(root),
      openLabel: 'Exclude from the scan', title: 'Folders to exclude from the Xygeni scan'
    });
    if (!picked || picked.length === 0) { return; }
    let config = this.getScanConfig();
    const outside: string[] = [];
    for (const folder of picked) {
      const pattern = excludePatternForFolder(root, folder.fsPath);
      if (pattern) { config = withExclude(config, pattern); } else { outside.push(folder.fsPath); }
    }
    if (outside.length > 0) {
      vscode.window.showWarningMessage(`Only folders inside the workspace can be excluded: ${outside.join(', ')}`);
    }
    this.saveScanConfig(config);
  }

  /** Types a glob pattern (scanner syntax: `*` file wildcard, `**` any depth, `path:` prefix for a sub-project). */
  public async addExcludePattern(): Promise<void> {
    const pattern = await vscode.window.showInputBox({
      prompt: 'Pattern to exclude from the Xygeni scan (added to the scanner defaults)',
      placeHolder: '**/fixtures/**',
      validateInput: (value) => value.trim().length === 0 ? 'Enter a pattern' : value.includes(',') ? 'One pattern at a time (no commas)' : null
    });
    if (pattern === undefined) { return; }
    this.saveScanConfig(withExclude(this.getScanConfig(), pattern.trim()));
  }

  public removeExclude(pattern: string): void {
    this.saveScanConfig(withoutExclude(this.getScanConfig(), pattern));
  }

  /**
   * Adds one `xygeni scan` option, typed as on the command line (`--ai-review=all`). Only the options in
   * SCAN_OPTIONS are accepted; the text is validated here again, whatever the view checked.
   * @returns the error to show next to the input, or undefined when added
   */
  public addScanOption(text: string): string | undefined {
    const result = validateScanOption(text);
    if (!result.ok) { return result.error; }
    this.saveScanConfig(withScanOption(this.getScanConfig(), result.option));
    return undefined;
  }

  /** The same from the command palette, with the options as the quick pick items. */
  public async addScanOptionFromPalette(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      SCAN_OPTIONS.map(spec => ({ label: spec.name, description: spec.kind === 'flag' ? '' : `=${spec.placeholder ?? spec.values?.join('|') ?? 'value'}`, detail: spec.description, spec })),
      { placeHolder: 'Scanner option to add to the scans of this workspace', matchOnDetail: true });
    if (!picked) { return; }
    let text = picked.spec.name;
    if (picked.spec.kind === 'enum') {
      const value = await vscode.window.showQuickPick([...picked.spec.values!], { placeHolder: `${picked.spec.name}=` });
      if (!value) { return; }
      text = `${picked.spec.name}=${value}`;
    } else if (picked.spec.kind !== 'flag') {
      const value = await vscode.window.showInputBox({
        prompt: `${picked.spec.name}: ${picked.spec.description}`, placeHolder: picked.spec.placeholder,
        validateInput: (input) => { const check = validateScanOption(`${picked.spec.name}=${input}`); return check.ok ? null : check.error; }
      });
      if (value === undefined) { return; }
      text = `${picked.spec.name}=${value}`;
    }
    const error = this.addScanOption(text);
    if (error) { vscode.window.showWarningMessage(error); }
  }

  public removeScanOption(name: string): void {
    this.saveScanConfig(withoutScanOption(this.getScanConfig(), name));
  }

  /** Opens `.xygeni/ide.json`, writing the current (maybe default) configuration first when it does not exist. */
  public async openScanConfigFile(): Promise<void> {
    const filePath = this.getScanConfigPath();
    if (!filePath) { return; }
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, serializeScanConfig(this.getScanConfig()));
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document);
  }

  /**
   * Toggle auto-scan on save setting
   */
  public async toggleAutoScan(): Promise<void> {
    const newValue = await ConfigManager.toggleAutoScan();
    // Switched on with nothing chosen for on save: start from the default on-save types (#415).
    if (newValue && this.getScanConfig().onSave.length === 0 && this.getWorkspaceFolders()[0]) {
      this.saveScanConfig(withDefaultOnSave(this.getScanConfig()));
    }
    this.refreshAllViews();
  }

  /**
   * Toggle one of the scanner global option checkboxes (GLOBAL_OPTION_TOGGLES). Turning on
   * --skip-ssl-verify weakens transport security, so it asks for confirmation first. (xygeni/tech-support#378)
   */
  public async toggleGlobalOption(setting: string): Promise<void> {
    const enabled = ConfigManager.getScanFlag(setting);
    if (!enabled && setting === 'skipSslVerify') {
      const enable = 'Enable';
      const choice = await vscode.window.showWarningMessage(
        'Skip SSL certificate validation in the Xygeni scanner?',
        {
          modal: true,
          detail: 'Use it only when a corporate proxy inspects TLS traffic and re-signs it with an internal CA, '
            + 'so the scan fails with certificate errors. This reduces transport security: use it only in trusted networks.'
        },
        enable
      );
      if (choice !== enable) { return; }
    }
    await ConfigManager.setScanFlag(setting, !enabled);
    this.refreshAllViews();
  }

  /**
   * Run Xygeni Scanner in incremental mode (triggered by auto-scan on save)
   */
  public async runIncrementalScan(): Promise<void> {
    if (!this.isLicenseAvailable()) {
      Logger.log('Xygeni IDE License is not available. Incremental scan skipped.');
      return;
    }
    if (this.isLicenseFree()) {
      Logger.log('Auto Scan on Save is not available in the Xygeni Free edition. Incremental scan skipped.');
      return;
    }
    const scanner = XygeniScannerService.getInstance();
    if (scanner.isScannerRunning()) {
      return;
    }
    if (!this.isInstallReady()) {
      return;
    }
    this.initScannerRun();

    const sourceFolder = this.getWorkspaceFolders()[0];
    if (!sourceFolder) return;

    scanner.setScanConfig(this.getScanConfig());
    if (scanner.getIncrementalScanTypes().length === 0) {
      Logger.log('No scan type is configured to run on save (.xygeni/ide.json). Incremental scan skipped.');
      return;
    }

    try {
      await scanner.runIncrementalAnalysis(sourceFolder, this.getXygeniInstallPath(), this.getScanOutputChannel());
      this.readIssues(scanner.getIncrementalScanTypes());
      this.refreshAllViews();
    } catch (error) {
      Logger.error(error, "Error running incremental scanner");
    }
  }

  /** With `scanTypes` only those reports are re-read (incremental scan); without, all of them. */
  public readIssues = _.throttle(
    (scanTypes?: string[], keepOthers = true) => {
      IssuesService.getInstance().readIssues(scanTypes, keepOthers);
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

  isLicenseAvailable(): boolean {
    return !!this.xygeniContext.getKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE);
  }

  isLicenseFree(): boolean {
    return !!this.xygeniContext.getKey(XYGENI_CONTEXT.LICENSE_FREE);
  }

  showMcpSetupView() {
    void McpSetupView.showMcpSetup(this);
  }

  /**
   * Installs the MCP library in the shared folder when missing (always with `force`). When it replaced a copy
   * inside an extension folder, the path in the user's MCP client config is stale: tell them and offer the guide.
   */
  private installMcpLibrary(force: boolean): void {
    const installer = InstallerService.getInstance();
    installer.downloadMCPLibrary(force)
      .then((movedFromLegacyPath) => {
        if (!installer.isMcpLibraryInstalled()) {
          return;
        }
        this.setMcpLibraryInstalled();
        Logger.log(`=== MCP Library is ready. Check Xygeni MCP Setup to configure it. ===`);
        if (movedFromLegacyPath) {
          const message = `The Xygeni MCP server moved to ${installer.getMcpLibraryPath()}. Update the path in your MCP client configuration.`;
          Logger.log(message);
          vscode.window.showWarningMessage(message, 'Open MCP Setup').then((choice) => {
            if (choice) {
              this.showMcpSetupView();
            }
          });
        }
        // The connection and license were validated before the install: time for the daily version check.
        return this.checkMcpUpdates(false);
      })
      .catch((error) => {
        Logger.log(" Error downloading Xygeni MCP library. MCP Server will not be available: " + error);
      });
  }

  /**
   * Checks whether a newer MCP server is published and acts on the `xygeni.mcp.updates` setting: notify
   * (Update / Ignore this version), update in the background, or nothing. The installer checks at most once
   * every 24 h across IDEs unless `force` (the command, which also reports "up to date" and failures). A failed
   * check is only logged (xygeni/xygeni-product-backlog#2382).
   */
  public async checkMcpUpdates(force: boolean): Promise<void> {
    const mode = ConfigManager.getMcpUpdateMode();
    if (!force && mode === 'off') {
      // No check, but a download kept as `.pending` (JAR locked at the time) is still applied on this start (MCP.md).
      await InstallerService.getInstance().applyPendingMcpUpdate().catch((error) => Logger.error(error, 'Pending MCP server update'));
      return;
    }
    let result;
    try {
      result = await InstallerService.getInstance().checkMcpUpdate(force);
    } catch (error: any) {
      Logger.error(error, 'MCP server update check failed');
      if (force) {
        vscode.window.showWarningMessage(`Could not check for Xygeni MCP server updates: ${error.message}`);
      }
      return;
    }
    switch (result.status) {
      case 'not-installed':
        if (force) {
          vscode.window.showWarningMessage('The Xygeni MCP server is not installed yet. Connect to Xygeni and install the scanner first.');
        }
        return;
      case 'skipped':
        return;
      case 'unavailable':
        if (force) {
          vscode.window.showWarningMessage('Could not check for Xygeni MCP server updates: the published version is not available.');
        }
        return;
      case 'up-to-date':
        if (force) {
          vscode.window.showInformationMessage(`The Xygeni MCP server is up to date (${result.available}).`);
        }
        return;
      case 'update-available':
        break;
    }
    const ignoredVersion = GlobalContextImpl.getInstance().getGlobalStateValue(STATE_MCP_IGNORED_VERSION);
    if (!force && ignoredVersion === result.available) {
      Logger.log(`MCP server ${result.available} is ignored by the user`);
      return;
    }
    if (!force && mode === 'auto') {
      await this.updateMcpLibrary();
      return;
    }
    const message = `A new version of the Xygeni MCP server is available (${result.installed ?? 'unknown'} → ${result.available}).`;
    const update = 'Update';
    const ignore = 'Ignore this version';
    const choice = await vscode.window.showInformationMessage(message, update, ignore);
    if (choice === update) {
      await this.updateMcpLibrary();
    } else if (choice === ignore) {
      await GlobalContextImpl.getInstance().updateGlobalStateValue(STATE_MCP_IGNORED_VERSION, result.available);
      Logger.log(`MCP server ${result.available} will not be offered again`);
    }
  }

  /** Downloads the published MCP server over the installed one and says when it is loaded. */
  public async updateMcpLibrary(): Promise<void> {
    const installer = InstallerService.getInstance();
    try {
      const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Updating Xygeni MCP server...' },
        () => installer.updateMcpLibrary()
      );
      const version = installer.getMcpInstalledVersion() ?? 'the published version';
      const openMcpSetup = 'Open MCP Setup';
      if (outcome === 'installed') {
        // The note stays in the Configuration view and MCP Setup until the user says the client was restarted.
        await GlobalContextImpl.getInstance().updateGlobalStateValue(STATE_MCP_RESTART_PENDING, version);
        this.refreshConfigView();
        const restarted = 'OK';
        const howTo = 'Show me how';
        vscode.window.showInformationMessage(`Xygeni MCP server updated to ${version}. ${MCP_RESTART_NOTE}`, howTo, restarted)
          .then((choice) => {
            if (choice === restarted) { void this.dismissMcpRestart(); }
            else if (choice === howTo) { this.showMcpSetupView(); }
          });
      } else {
        vscode.window.showWarningMessage('The Xygeni MCP server update was downloaded but the installed JAR is in use. '
          + 'Close your MCP client; the update is applied the next time VS Code starts.', openMcpSetup)
          .then((choice) => { if (choice) { this.showMcpSetupView(); } });
      }
    } catch (error: any) {
      Logger.error(error, 'Error updating the MCP server');
      const retry = 'Retry';
      vscode.window.showErrorMessage(`Failed to update the Xygeni MCP server: ${error.message}`, retry)
        .then((choice) => { if (choice === retry) { void this.updateMcpLibrary(); } });
    }
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

    // license not valid until checked (fail-closed)
    this.xygeniContext.setKey(XYGENI_CONTEXT.LICENSE_IDE_AVAILABLE, false);

    // license type unknown until /license/state responds; default to non-Free
    this.xygeniContext.setKey(XYGENI_CONTEXT.LICENSE_FREE, false);

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
