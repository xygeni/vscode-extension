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

export const COMMAND_INSTALL_SCANNER = 'xygeni.scan.install';
export const COMMAND_RUN_SCANNER = 'xygeni.scan.run';

export const COMMAND_SHOW_OUTPUT = 'xygeni.showOutput';
export const COMMAND_SHOW_SCAN_OUTPUT = 'xygeni.showScanOutput';

export const COMMAND_OPEN_PROXY_CONFIG = 'xygeni.openProxyConfig';

// configurations
export const CONFIG_XYGENI_API_URL = 'xygeni.api.xygeniUrl';

export const XYGENI_CONTEXT = {
    WELCOME: 'welcome',
    API_ERROR: 'apiError',
    WORKSPACE_FOUND: 'workspaceFound',
    SHOW_CONFIG: 'showConfig',
    CONNECTION_READY: 'connectionReady',
    CONNECTING: 'connecting',
    INSTALL_ERROR: 'installError',
    INSTALL_READY: 'installReady',
    INSTALLING: 'installing',
    SCANNER_RESULTS: 'scannerResults',
    SCANNING: 'scanning'
};

export const STATUS = {
    OK: 'ok',
    ERROR: 'error',
    RUNNING: 'running',
    UNKNOWN: 'unknown'
};

