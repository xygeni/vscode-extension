import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import { AiIssueView, ApisecIssueView, IaCIssueView, IssueView, MalwareIssueView, MisconfIssueView, QualityIssueView, SastIssueView, ScaIssueView, SecretsIssueView } from './views/issue-view';
import { HelpView } from './views/help-view';
import { ConfigurationWebview } from './views/configuration-webview';
import { XYGENI_SHOW_CONFIG_COMMAND, XYGENI_CONTEXT, COMMAND_EDIT_XYGENI_API_URL, COMMAND_EDIT_XYGENI_TOKEN, COMMAND_TEST_XYGENI_CONNECTION, COMMAND_INSTALL_SCANNER, XYGENI_CLOSE_CONFIG_COMMAND, COMMAND_RUN_SCANNER, COMMAND_SHOW_OUTPUT, COMMAND_OPEN_PROXY_CONFIG, COMMAND_OPEN_SETTINGS, COMMAND_SHOW_SCAN_OUTPUT, COMMAND_SHOW_MCP_SETUP, COMMAND_CHECK_MCP_UPDATES, COMMAND_TOGGLE_AUTO_SCAN, COMMAND_TOGGLE_GLOBAL_OPTION, COMMAND_UPGRADE_LICENSE, COMMAND_TOGGLE_SCAN_TYPE, COMMAND_TOGGLE_ON_SAVE_SCAN_TYPE, COMMAND_SELECT_ALL_SCAN_TYPES, COMMAND_RESTORE_SCAN_DEFAULTS, COMMAND_OPEN_SCAN_CONFIG_FILE, COMMAND_ADD_EXCLUDE_FOLDER, COMMAND_ADD_EXCLUDE_PATTERN, COMMAND_REMOVE_EXCLUDE, COMMAND_ADD_SCAN_OPTION, COMMAND_REMOVE_SCAN_OPTION, COMMAND_RUN_SCAN_TYPE_PREFIX, RESULT_VIEW_SCAN_TYPES } from './common/constants';
import { ScanType } from './service/scan-config';
import { XyContextImpl } from './common/context';
import InstallerService from './service/installer';
import { Logger } from './common/logger';
import { EmptyTreeDataProvider } from './common/views';
import { CommandsImpl } from './common/commands';
import XygeniScannerService from './service/scanner';
import GlobalContextImpl from './service/global-context';
import { ConfigManager } from './config/xygeni-configuration';
import IssuesService from './service/issues';
import EventEmitterImpl from './common/event-emitter';
import { IssueDecorator } from './views/issueDecorator';
import { DiagnosticProvider } from './views/diagnosticProvider';
import { RemediationDiffContentProvider } from './views/remediation-providers';
import LicenseService from './service/license';
import { RemediationService } from './service/remediation';



class XygeniExtension {

  public async activate(context: vscode.ExtensionContext): Promise<void> {

    const xygeniVersion = context.extension.packageJSON.version;

    const xygeniContext = XyContextImpl.getInstance();
    const commands = CommandsImpl.getInstance(context, xygeniContext);

    // Create and register view providers. Configuration (connection, scan, scan configuration) is a webview (#415).
    const resultTreeViews: Record<string, vscode.TreeView<unknown>> = {};
    const resultTree = (id: string, treeDataProvider: vscode.TreeDataProvider<any>) => {
      const treeView = vscode.window.createTreeView(id, { treeDataProvider });
      resultTreeViews[id] = treeView;
      return treeView;
    };

    const sastViewProvider = new SastIssueView(commands);
    const scaViewProvider = new ScaIssueView(commands);
    const misconfViewProvider = new MisconfIssueView(commands);
    const secretsViewProvider = new SecretsIssueView(commands);
    const iacViewProvider = new IaCIssueView(commands);
    const qualityViewProvider = new QualityIssueView(commands);
    const apisecViewProvider = new ApisecIssueView(commands);
    const aiViewProvider = new AiIssueView(commands);
    const malwareViewProvider = new MalwareIssueView(commands);

    const issueDecorator = new IssueDecorator();
    const diagnosticProvider = new DiagnosticProvider();
    const remediationDiffProvider = new RemediationDiffContentProvider(xygeniContext, commands);

    const licenseService = LicenseService.getInstance(context.extensionPath, Logger, commands);

    const debouncedIncrementalScan = _.debounce(() => {
      if (ConfigManager.getAutoScan() && !commands.isLicenseFree()) {
        commands.runIncrementalScan();
      }
    }, 1000, { leading: false, trailing: true });

    context.subscriptions.push(
      // Register help webview provider
      vscode.window.registerWebviewViewProvider(HelpView.viewType, new HelpView(xygeniVersion)),

      // Configuration (#415): connection, scan and scan configuration in one webview section.
      vscode.window.registerWebviewViewProvider(ConfigurationWebview.viewType,
        new ConfigurationWebview(context.extensionUri, commands, xygeniContext, (view) => resultTreeViews[view]?.visible ?? false),
        { webviewOptions: { retainContextWhenHidden: true } }),

      // Register welcome view provider
      vscode.window.createTreeView('xygeni.views.welcome', {
        treeDataProvider: new EmptyTreeDataProvider(),
      }),

      resultTree('xygeni.views.sast', sastViewProvider),
      resultTree('xygeni.views.sca', scaViewProvider),
      resultTree('xygeni.views.cicd', misconfViewProvider),
      resultTree('xygeni.views.secrets', secretsViewProvider),
      resultTree('xygeni.views.iac', iacViewProvider),
      resultTree('xygeni.views.quality', qualityViewProvider),
      resultTree('xygeni.views.apisec', apisecViewProvider),
      resultTree('xygeni.views.ai', aiViewProvider),
      resultTree('xygeni.views.malware', malwareViewProvider),

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
      // Every Xygeni setting (connection, proxy, scan options) filtered in the Settings editor.
      vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
        commands.openProxySettings();
      }),

      vscode.commands.registerCommand(COMMAND_SHOW_OUTPUT, () => {
        Logger.showOutput();
      }),

      vscode.commands.registerCommand(COMMAND_SHOW_SCAN_OUTPUT, () => {
        commands.showScanOutput();
      }),

      // configuration commands
      vscode.commands.registerCommand(COMMAND_EDIT_XYGENI_API_URL, () => {
        commands.editUrl();
      }),

      vscode.commands.registerCommand(COMMAND_EDIT_XYGENI_TOKEN, () => {
        commands.editToken();
      }),

      vscode.commands.registerCommand(COMMAND_TEST_XYGENI_CONNECTION, async (override?: boolean) => {
        await commands.refreshAndInstall(override);
      }),

      // scanner commands
      vscode.commands.registerCommand(COMMAND_INSTALL_SCANNER, async () => {
        await commands.installScanner();
      }),
      vscode.commands.registerCommand(COMMAND_RUN_SCANNER, async () => {
        await commands.runScanner();
      }),
      vscode.commands.registerCommand(COMMAND_TOGGLE_AUTO_SCAN, async () => {
        await commands.toggleAutoScan();
      }),
      vscode.commands.registerCommand(COMMAND_TOGGLE_GLOBAL_OPTION, async (setting: string) => {
        await commands.toggleGlobalOption(setting);
      }),

      vscode.commands.registerCommand(COMMAND_UPGRADE_LICENSE, () => {
        commands.openUpgradePage();
      }),

      // per-project scan configuration (#415)
      vscode.commands.registerCommand(COMMAND_TOGGLE_SCAN_TYPE, (type: ScanType) => {
        commands.toggleScanType(type);
      }),
      vscode.commands.registerCommand(COMMAND_TOGGLE_ON_SAVE_SCAN_TYPE, (type: ScanType) => {
        commands.toggleOnSaveScanType(type);
      }),
      vscode.commands.registerCommand(COMMAND_SELECT_ALL_SCAN_TYPES, () => {
        commands.setAllScanTypes(true);
      }),
      vscode.commands.registerCommand(COMMAND_RESTORE_SCAN_DEFAULTS, () => {
        commands.restoreScanDefaults();
      }),
      vscode.commands.registerCommand(COMMAND_OPEN_SCAN_CONFIG_FILE, async () => {
        await commands.openScanConfigFile();
      }),
      vscode.commands.registerCommand(COMMAND_ADD_EXCLUDE_FOLDER, async () => {
        await commands.addExcludeFolder();
      }),
      vscode.commands.registerCommand(COMMAND_ADD_EXCLUDE_PATTERN, async () => {
        await commands.addExcludePattern();
      }),
      vscode.commands.registerCommand(COMMAND_ADD_SCAN_OPTION, async () => {
        await commands.addScanOptionFromPalette();
      }),
      vscode.commands.registerCommand(COMMAND_REMOVE_SCAN_OPTION, (name: string) => {
        commands.removeScanOption(name);
      }),
      // One command per results view: its play button runs that scan type alone (#415).
      ...Object.values(RESULT_VIEW_SCAN_TYPES).map((type) =>
        vscode.commands.registerCommand(`${COMMAND_RUN_SCAN_TYPE_PREFIX}${type}`, async () => {
          await commands.runScanner([type as ScanType]);
        })),
      vscode.commands.registerCommand(COMMAND_REMOVE_EXCLUDE, (pattern: string) => {
        commands.removeExclude(pattern);
      }),

      vscode.commands.registerCommand(COMMAND_SHOW_MCP_SETUP, (issue) => {
        commands.showMcpSetupView();
      }),

      vscode.commands.registerCommand(COMMAND_CHECK_MCP_UPDATES, async () => {
        await commands.checkMcpUpdates(true);
      }),

      vscode.commands.registerCommand('xygeni.showIssueDetails', (issue) => {
        commands.showIssueDetails(issue);
      }),

      vscode.commands.registerCommand('xygeni.showIssueDetailsFromDiagnostic', (issueId) => {
        if (!issueId) { return; }
        const issue = commands.getIssues().find((candidate) => candidate.id === issueId);
        if (issue) {
          commands.showIssueDetails(issue);
        }
      }),

      vscode.workspace.onDidOpenTextDocument(() => {
        diagnosticProvider.updateDiagnostics(commands.getIssues());
      }),

      vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.uri.scheme !== 'file') {
          return;
        }
        if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
          return;
        }
        debouncedIncrementalScan();
      }),

      { dispose: () => debouncedIncrementalScan.cancel() },

      issueDecorator,
      diagnosticProvider,
      licenseService,

      // register diff preview provider
      vscode.workspace.registerTextDocumentContentProvider('preview-fix', remediationDiffProvider)
      
    );

    try {
      this.initXygeni(commands, issueDecorator, diagnosticProvider, context, xygeniContext);

      // state init
      await commands.initState();

      commands.setRemediationDiffProvider(remediationDiffProvider);

      // show welcome or config
      const xygeniUrl = ConfigManager.getXygeniUrl();
      const xygeniToken = await ConfigManager.getXygeniToken(context);

      if (xygeniUrl && xygeniToken) {
        commands.showConfigView();
        commands.refreshAndInstall().then(() => {
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
    InstallerService.getInstance(context.extensionPath, Logger, installerEmitter, commands);

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

    // init remediation
    RemediationService.getInstance(commands, Logger);
  }


}

export default XygeniExtension;
