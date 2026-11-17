import { ExtensionKind } from "vscode";

// xygeni
export const XYGENI_INSTALL_SCRIPT = 'https://';

// views
export const WELCOME_VIEW = 'xygeni.views.welcome';
export const SCAN_VIEW = 'xygeni.views.scan';
export const ISSUE_VIEW = 'xygeni.views.issue';
export const CONFIG_VIEW = 'xygeni.views.configuration';
export const HELP_VIEW = 'xygeni.views.help';

// output channels
export const XYGENI_EXTENSION_OUTPUT_NAME = 'Xygeni-Extension';
export const XYGENI_SCANNER_OUTPUT_NAME = 'Xygeni-Scanner';

// scanner
export const XYGENI_SCANNER_REPORT_SUFFIX = 'xygeni.xygeni-security'; // format as <publisher>.<extension-name>


// commands
export const XYGENI_SHOW_CONFIG_COMMAND = 'xygeni.showConfig';
export const XYGENI_CLOSE_CONFIG_COMMAND = 'xygeni.closeConfig';

export const COMMAND_EDIT_XYGENI_API_URL = 'xygeni.config.editUrl';
export const COMMAND_EDIT_XYGENI_TOKEN = 'xygeni.config.editToken';
export const COMMAND_TEST_XYGENI_CONNECTION = 'xygeni.config.testConnection';
export const COMMAND_SHOW_MCP_SETUP = 'xygeni.showMcpSetup';
export const COMMAND_CHECK_MCP_UPDATES = 'xygeni.mcp.checkUpdates';

export const COMMAND_INSTALL_SCANNER = 'xygeni.scan.install';
export const COMMAND_RUN_SCANNER = 'xygeni.scan.run';

export const COMMAND_SHOW_OUTPUT = 'xygeni.showOutput';
export const COMMAND_SHOW_SCAN_OUTPUT = 'xygeni.showScanOutput';

export const COMMAND_OPEN_PROXY_CONFIG = 'xygeni.openProxyConfig';
export const COMMAND_OPEN_SETTINGS = 'xygeni.openSettings';
export const COMMAND_TOGGLE_AUTO_SCAN = 'xygeni.scan.toggleAutoScan';
export const COMMAND_TOGGLE_GLOBAL_OPTION = 'xygeni.scan.toggleGlobalOption';
export const COMMAND_UPGRADE_LICENSE = 'xygeni.license.upgrade';
// Per-project scan configuration (#415)
export const COMMAND_TOGGLE_SCAN_TYPE = 'xygeni.scan.toggleScanType';
export const COMMAND_TOGGLE_ON_SAVE_SCAN_TYPE = 'xygeni.scan.toggleOnSaveScanType';
export const COMMAND_SELECT_ALL_SCAN_TYPES = 'xygeni.scan.selectAllScanTypes';
export const COMMAND_RESTORE_SCAN_DEFAULTS = 'xygeni.scan.restoreDefaults';
export const COMMAND_OPEN_SCAN_CONFIG_FILE = 'xygeni.scan.openConfigFile';
export const COMMAND_ADD_EXCLUDE_FOLDER = 'xygeni.scan.addExcludeFolder';
export const COMMAND_ADD_EXCLUDE_PATTERN = 'xygeni.scan.addExcludePattern';
export const COMMAND_REMOVE_EXCLUDE = 'xygeni.scan.removeExclude';
export const COMMAND_ADD_SCAN_OPTION = 'xygeni.scan.addOption';
export const COMMAND_REMOVE_SCAN_OPTION = 'xygeni.scan.removeOption';
/** `xygeni.scan.runOnly.<scanType>`: the play button of each results view runs that scan type alone (#415). */
export const COMMAND_RUN_SCAN_TYPE_PREFIX = 'xygeni.scan.runOnly.';
/** Results view id → the scan type its play button runs. */
export const RESULT_VIEW_SCAN_TYPES: Readonly<Record<string, string>> = {
  'xygeni.views.sast': 'sast', 'xygeni.views.sca': 'deps', 'xygeni.views.cicd': 'misconf', 'xygeni.views.secrets': 'secrets',
  'xygeni.views.iac': 'iac', 'xygeni.views.quality': 'quality', 'xygeni.views.apisec': 'apisec', 'xygeni.views.ai': 'ai',
  'xygeni.views.malware': 'malware',
};

// external links
export const XYGENI_PRICING_URL = 'https://xygeni.io/pricing/';

// configurations
export const CONFIG_XYGENI_API_URL = 'xygeni.api.xygeniUrl';
// global state
export const STATE_MCP_IGNORED_VERSION = 'xygeni.mcp.ignoredVersion';
/** Version installed by an update that MCP clients have not loaded yet (cleared when the user dismisses it). */
export const STATE_MCP_RESTART_PENDING = 'xygeni.mcp.restartPending';
/** What the user must do after an MCP server update: the plugin only replaces the JAR, the MCP client owns the process. */
export const MCP_RESTART_NOTE = 'Your AI assistant (Copilot, Claude Code, Cursor…) will use it the next time it starts: if it is open now, restart it.';

export const XYGENI_CONTEXT = {
    WELCOME: 'welcome',
    API_ERROR: 'apiError',
    WORKSPACE_FOUND: 'workspaceFound',
    LICENSE_IDE_AVAILABLE: 'licenseIdeAvailable',
    LICENSE_FREE: 'licenseFree',
    SHOW_CONFIG: 'showConfig',
    CONNECTION_READY: 'connectionReady',
    CONNECTING: 'connecting',
    INSTALL_ERROR: 'installError',
    INSTALL_READY: 'installReady',
    INSTALLING: 'installing',
    SCANNER_RESULTS: 'scannerResults',
    SCANNING: 'scanning',
    MCP_LIBRARY_INSTALLED: 'mcpLibraryInstalled'
};

export const STATUS = {
    OK: 'ok',
    ERROR: 'error',
    RUNNING: 'running',
    UNKNOWN: 'unknown'
};

export const ISSUE_DETAILS_REMEDIATE_FUNCTION = "runRemediation";
export const ISSUE_DETAILS_SAST_REMEDIATE_FUNCTION = "runSASTRemediation";
export const ISSUE_DETAILS_SAVE_FUNCTION = "runSaveRemediation";
export const ISSUE_DETAILS_EXPLAIN_FUNCTION = "explainIssue";

