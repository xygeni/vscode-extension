import * as vscode from 'vscode';
import ConfigurationView from './views/configuration-view';
import { ScanView } from './views/scan-view';
import { IaCIssueView, IssueView, MisconfIssueView, SastIssueView, ScaIssueView, SecretsIssueView } from './views/issue-view';
import { HelpView } from './views/help-view';
import { XYGENI_SHOW_CONFIG_COMMAND, XYGENI_CONTEXT, COMMAND_EDIT_XYGENI_API_URL, COMMAND_EDIT_XYGENI_TOKEN, COMMAND_TEST_XYGENI_CONNECTION, COMMAND_INSTALL_SCANNER, XYGENI_CLOSE_CONFIG_COMMAND, COMMAND_RUN_SCANNER, COMMAND_SHOW_OUTPUT, COMMAND_OPEN_PROXY_CONFIG, COMMAND_SHOW_SCAN_OUTPUT } from './common/constants';
import { XyContextImpl } from './common/context';
import InstallerService from './service/installer';
import { Logger } from './common/logger';
import { EmptyTreeDataProvider } from './common/views';
import { CommandsImpl } from './common/commands';
import XygeniScannerService from './service/scanner';
import GlobalContextImpl from './service/global-context';
import { ConfigManager } from './config/xygeni-configuration';
import IssuesService from './service/issues';
import { log } from 'console';
import EventEmitterImpl from './common/event-emitter';
import { IssueDecorator } from './views/issueDecorator';
import { DiagnosticProvider } from './views/diagnosticProvider';
import { IacXygeniIssue } from './service/iac-issue';
import { VulnerabilitiesService } from './service/vulnerabilities';



class XygeniExtension {

  public async activate(context: vscode.ExtensionContext): Promise<void> {

    const xygeniContext = XyContextImpl.getInstance();
    const commands = CommandsImpl.getInstance(context, xygeniContext);

    // Create and register view providers
    const configViewProvider = new ConfigurationView(
      context,
      xygeniContext,
      commands);
    const scanViewProvider = new ScanView(context, commands);

    const sastViewProvider = new SastIssueView(commands);
    const scaViewProvider = new ScaIssueView(commands);
    const misconfViewProvider = new MisconfIssueView(commands);
    const secretsViewProvider = new SecretsIssueView(commands);
    const iacViewProvider = new IaCIssueView(commands);

    const issueDecorator = new IssueDecorator();
    const diagnosticProvider = new DiagnosticProvider();

    context.subscriptions.push(
      // Register help webview provider
      vscode.window.registerWebviewViewProvider(HelpView.viewType, new HelpView()),

      // Register welcome view provider
      vscode.window.createTreeView('xygeni.views.welcome', {
        treeDataProvider: new EmptyTreeDataProvider(),
      }),

      // Register configuration view
      vscode.window.createTreeView('xygeni.views.configuration', {
        treeDataProvider: configViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.scan', {
        treeDataProvider: scanViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.sast', {
        treeDataProvider: sastViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.sca', {
        treeDataProvider: scaViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.cicd', {
        treeDataProvider: misconfViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.secrets', {
        treeDataProvider: secretsViewProvider
      }),
      vscode.window.createTreeView('xygeni.views.iac', {
        treeDataProvider: iacViewProvider
      }),

      // Commands
      vscode.commands.registerCommand(XYGENI_SHOW_CONFIG_COMMAND, () => {
        commands.showConfigView();
      }),

      vscode.commands.registerCommand(XYGENI_CLOSE_CONFIG_COMMAND, () => {
        commands.closeConfigView();
      }),

      vscode.commands.registerCommand(COMMAND_OPEN_PROXY_CONFIG, () => {
        commands.openProxySettings();
      }),

      vscode.commands.registerCommand(COMMAND_SHOW_OUTPUT, () => {
        Logger.showOutput();
      }),

      vscode.commands.registerCommand(COMMAND_SHOW_SCAN_OUTPUT, () => {
        Logger.showOutput();
      }),

      // configuration commands
      vscode.commands.registerCommand(COMMAND_EDIT_XYGENI_API_URL, () => {
        commands.editUrl();
      }),

      vscode.commands.registerCommand(COMMAND_EDIT_XYGENI_TOKEN, () => {
        commands.editToken();
      }),

      vscode.commands.registerCommand(COMMAND_TEST_XYGENI_CONNECTION, async (override?: boolean) => {
        await commands.testConnection(override);
      }),

      // scanner commands
      vscode.commands.registerCommand(COMMAND_INSTALL_SCANNER, async () => {
        await commands.installScanner();
      }),
      vscode.commands.registerCommand(COMMAND_RUN_SCANNER, async () => {
        await commands.runScanner();
      }),

      vscode.commands.registerCommand('xygeni.showIssueDetails', (issue) => {
        commands.showIssueDetails(issue);
      }),

      vscode.commands.registerCommand('xygeni.showIssueDetailsFromDiagnostic', (issueId) => {
        const issue = commands.getIssues().find(i => i.id === issueId);
        if (issue) {
          commands.showIssueDetails(issue);
        }
      }),

      vscode.workspace.onDidOpenTextDocument(() => {
        diagnosticProvider.updateDiagnostics(commands.getIssues());
      }),

      issueDecorator,
      diagnosticProvider

    );

    try {
      this.initChecks();
      this.initXygeni(commands, issueDecorator, diagnosticProvider, context, xygeniContext);

      // state init
      await commands.initState();

      // show welcome or config
      const xygeniUrl = ConfigManager.getXygeniUrl();
      const xygeniToken = await ConfigManager.getXygeniToken(context);

      if (xygeniUrl && xygeniToken) {
        commands.showConfigView();
        commands.testConnection().then(() => {
          commands.readIssues();
        });
      } else {
        commands.showWelcomeView();
      }

    } catch (e) {
      Logger.error(e, 'Failed to initialize Xygeni');
    }

    Logger.log('================================================================');
    Logger.log('             Xygeni Extension Activated');
    Logger.log('================================================================');
  }

  public async deactivate(): Promise<void> {

  }

  private initXygeni(
    commands: CommandsImpl,
    issueDecorator: IssueDecorator,
    diagnosticProvider: DiagnosticProvider,
    context: vscode.ExtensionContext,
    xygeniContext: XyContextImpl
  ): void {

    // init global context
    GlobalContextImpl.getInstance(context);

    // init installer
    const installerEmitter = new EventEmitterImpl();
    installerEmitter.onDidChange(() => { commands.refreshAllViews(); });
    InstallerService.getInstance(context.extensionPath, Logger, installerEmitter);

    // init scanner and subscribe to changes
    XygeniScannerService.getInstance(commands, Logger).onDidChange(() => {
      commands.refreshAllViews();
    });

    // init issues
    const issuesEmitter = new EventEmitterImpl();
    issuesEmitter.onDidChange(() => {
      issueDecorator.updateIssues(commands.getIssues());
      diagnosticProvider.updateDiagnostics(commands.getIssues());
      commands.issuesAvailable();
    });
    IssuesService.getInstance(Logger, issuesEmitter, commands);
    VulnerabilitiesService.getInstance(context, Logger);

  }

  private initChecks() {

  }
}

export default XygeniExtension;
