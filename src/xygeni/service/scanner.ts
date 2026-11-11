import { spawn, execFileSync } from 'child_process';
import EventEmitter from '../common/event-emitter';
import { Commands, ILogger, IOutputChannel, ScanResult, WorkspaceFiles, XyContext } from "../common/interfaces";
import { OutputChannelWrapper } from '../common/logger';
import GlobalContext from './global-context';
import { Platform } from '../common/platform';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { commands as vscodeCommands, window } from 'vscode';
import { COMMAND_TOGGLE_GLOBAL_OPTION, XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from '../common/constants';
import IssuesService from './issues';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { LICENSE_ERROR_EXIT_CODE, hasReportWrittenSince, isCompletedRun, reportFreshnessStartTime } from './scan-exit-code';
import { ConfigManager } from '../config/xygeni-configuration';
import { GLOBAL_OPTION_TOGGLES, SKIP_SSL_VERIFY_OPTION, blockedOptionsIn, buildGlobalOptions, isCertificateError } from './scanner-options';
import { ScanConfig, ScanType, defaultScanConfig, excludeAddArgument } from './scan-config';
import { scanOptionArguments } from './scan-options';
import { assertTokenMayBeSentTo } from '../common/insecure-url';


    /**
     * Run scanner using workspace storage as working directory.
     * Allow only one scanner running at a time.
     * Issues reports are persisted in workspace storage.
     * Scanner command (no report is uploaded, generate issues reports in json format at working directory):
     *   scan --run=deps,secrets,misconf,iac,suspectdeps,sast,malware,quality,apisec,ai -f json -o <reportOutputPath> -d <sourceFolder> --no-upload
     */
class XygeniScannerService extends EventEmitter {

    private static instance: XygeniScannerService;

    readonly timeout = 1800000; // 30 minutes
    readonly output_suffix = '/scanner.report.json';

    /** The scan types of the full and the on-save scans come from the project's `.xygeni/ide.json` (#415). */
    private scanConfig: ScanConfig = defaultScanConfig();

    readonly run_analysis_base_args = ['-f', 'json', '-o', XYGENI_SCANNER_REPORT_SUFFIX, '--no-upload', '--include-vulnerabilities'];

    readonly run_rectify_sca_args = ['util', 'rectify', '--sca'];
    readonly run_rectify_sast_args = ['util', 'rectify', '--sast'];
    readonly run_rectify_quality_args = ['util', 'rectify', '--quality'];
    // RectifyCommand.java `--ai` → runAiRectify(file, detector, line): same parameters as SAST/quality.
    readonly run_rectify_ai_args = ['util', 'rectify', '--ai'];

    private scannerRunning = false;
    private cachedJavaHome: string | undefined | null = null; // null = not yet resolved
    private cachedPowerShellPath: string | undefined | null = null; // null = not yet resolved
    private cachedPowerShellProbed: string[] = [];
    private scannerQueue: Array<() => Promise<void>> = [];
    private maxConcurrentScanners = 3;
    private activeScannerCount = 0;

    private exitCode: number | undefined;
    private skipSslVerifySuggested = false;


    private scans: ScanResult[] = [];


    public static getInstance(commands?: Commands, logger?: ILogger): XygeniScannerService {
        if (!XygeniScannerService.instance) {
            if (commands === undefined) {
                throw new Error('Commands are required');
            }
            if (logger === undefined) {
                throw new Error('Logger are required');
            }
            XygeniScannerService.instance = new XygeniScannerService(commands, logger);
        }
        return XygeniScannerService.instance;
    }

    private constructor(private readonly commands: Commands, private logger: ILogger) {
        super();
    }

    /** The full scan, or with `only` just those scan types (their reports alone are refreshed by the caller). */
    async runAnalysis(sourceFolder: string, xygeniScannerPath: string, output: IOutputChannel, only?: ScanType[]) {
        
        this.exitCode = undefined;
        output.clear();
        output.show();

        const timestamp = new Date();

        // show only last 5 scans
        if (this.scans.length > 5) {
            this.scans.shift(); // remove the oldest scan
        }

        this.logger.log('');        
        this.logger.log('================================');       
        const onlyNote = only && only.length > 0 ? `${only.join(',')} - ` : '';
        this.logger.log(`Running ${onlyNote}scan on source folder: ${sourceFolder}`);

        this.scans.push({ timestamp: timestamp, status: 'running', issuesFound: undefined, summary: only?.join(',') ?? '' });
        this.emitChange();

        return this.runAnalysisCommand(sourceFolder, xygeniScannerPath, output, only).then((exitCode) => {

            this.logger.log('  Scanner finished');
            this.scans.pop();
            const totalTimeInSeconds = (new Date().getTime() - timestamp.getTime()) / 1000;
            this.scans.push({ timestamp: timestamp, status: 'completed', issuesFound: undefined, summary: onlyNote + 'Duration: ' + totalTimeInSeconds + 's' + this.licenseNote(exitCode) });
            this.reportLicenseSkips(exitCode, output);

            this.exitCode = exitCode;

            this.emitChange();

            return;
        }).catch((error) => {
            this.logger.error('Error running scanner', error);
            
            this.exitCode = 1;
            this.scans.pop();
            this.scans.push(
                { timestamp: timestamp, status: 'failed', issuesFound: undefined, summary: '' }
            );
            this.emitChange();
        });
    }

    
    public isScannerRunning() {
        return this.scannerRunning;
    }

    /**
     * Check if there are any queued or active scanners from rectification calls
     */
    public hasQueuedScanners(): boolean {
        return this.scannerQueue.length > 0 || this.activeScannerCount > 0;
    }

    /**
     * Get the current number of active and queued scanners
     */
    public getScannerStats(): { active: number; queued: number; maxConcurrent: number } {
        return {
            active: this.activeScannerCount,
            queued: this.scannerQueue.length,
            maxConcurrent: this.maxConcurrentScanners
        };
    }

    public getExitCode(): number | undefined {
        this.scannerRunning = false;
        return this.exitCode;
    }

    public getScans(): ScanResult[] {
        return this.scans;
    }

    /** The scan configuration of the workspace about to be scanned (xygeni/xygeni-product-backlog#415). */
    public setScanConfig(config: ScanConfig): void {
        this.scanConfig = config;
    }

    public getScanConfig(): ScanConfig {
        return this.scanConfig;
    }

    /** The `--run=` scan types of the full scan; only their reports are refreshed by it. */
    public getFullScanTypes(): string[] {
        return [...this.scanConfig.scans];
    }

    /** The `--run=` scan types of the on-save incremental scan; only their reports are refreshed by it. */
    public getIncrementalScanTypes(): string[] {
        return [...this.scanConfig.onSave];
    }

    /**
     * `scan --run=<types> [--incremental] [--exclude-add=...] [<options>] -f json -o <suffix> --no-upload --include-vulnerabilities`.
     * With `only`, a single scan type instead of the configured full scan (the play button of a results view).
     */
    public buildScanArgs(incremental: boolean, only?: ScanType[]): string[] {
        const types = only && only.length > 0 ? only : incremental ? this.getIncrementalScanTypes() : this.getFullScanTypes();
        const excludeAdd = excludeAddArgument(this.scanConfig);
        return ['scan', `--run=${types.join(',')}`, ...(incremental ? ['--incremental'] : []), ...(excludeAdd ? [excludeAdd] : []),
            ...scanOptionArguments(this.scanConfig.options), ...this.run_analysis_base_args];
    }

    public runAnalysisCommand(sourceFolder: string, xygeniInstallPath: string, output: IOutputChannel, only?: ScanType[]): Promise<number> {
        const args = [...this.buildScanArgs(false, only), '-d', sourceFolder];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    async runIncrementalAnalysis(sourceFolder: string, xygeniScannerPath: string, output: IOutputChannel) {

        this.exitCode = undefined;
        output.clear();
        output.show();

        const timestamp = new Date();

        if (this.scans.length > 5) {
            this.scans.shift();
        }

        this.logger.log('');
        this.logger.log('================================');
        this.logger.log(`Running incremental scan on source folder: ${sourceFolder}`);

        this.scans.push({ timestamp: timestamp, status: 'running', issuesFound: undefined, summary: 'incremental' });
        this.emitChange();

        return this.runIncrementalAnalysisCommand(sourceFolder, xygeniScannerPath, output).then((exitCode) => {

            this.logger.log('  Incremental scanner finished');
            this.scans.pop();
            const totalTimeInSeconds = (new Date().getTime() - timestamp.getTime()) / 1000;
            this.scans.push({ timestamp: timestamp, status: 'completed', issuesFound: undefined, summary: 'Incremental - Duration: ' + totalTimeInSeconds + 's' + this.licenseNote(exitCode) });
            this.reportLicenseSkips(exitCode, output);

            this.exitCode = exitCode;
            this.emitChange();

            return;
        }).catch((error) => {
            this.logger.error('Error running incremental scanner', error);

            this.exitCode = 1;
            this.scans.pop();
            this.scans.push(
                { timestamp: timestamp, status: 'failed', issuesFound: undefined, summary: 'incremental' }
            );
            this.emitChange();
        });
    }

    public runIncrementalAnalysisCommand(sourceFolder: string, xygeniInstallPath: string, output: IOutputChannel): Promise<number> {
        const args = [...this.buildScanArgs(true), '-d', sourceFolder];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifyScaCommand(filePath: string, dependency: string, xygeniInstallPath: string, output: IOutputChannel): Promise<number> {
        const args = [...this.run_rectify_sca_args, '--file-path', filePath, '--dependency', dependency];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifySastCommand(filePath: string, detector: string, line: string, xygeniInstallPath: string, output: IOutputChannel): Promise<number> {
        const args = [...this.run_rectify_sast_args, '--file-path', filePath, '--detector', detector, '--line', line];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifyQualityCommand(filePath: string, detector: string, line: string, xygeniInstallPath: string, output: IOutputChannel): Promise<number> {
        const args = [...this.run_rectify_quality_args, '--file-path', filePath, '--detector', detector, '--line', line];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifyAiCommand(filePath: string, detector: string, line: string, xygeniInstallPath: string, output: IOutputChannel): Promise<number> {
        const args = [...this.run_rectify_ai_args, '--file-path', filePath, '--detector', detector, '--line', line];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public async runAiExplainCommand(issueJson: string, outputFile: string, xygeniInstallPath: string, output: IOutputChannel): Promise<void> {
        // Avoid shell/CLI argument splitting by handing the JSON over via a file.
        // Picocli's --issue-json-file is exactly for "JSON large or with characters hard to escape on the command line".
        const tempFile = path.join(os.tmpdir(), `xygeni-issue-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
        await fs.promises.writeFile(tempFile, issueJson, 'utf8');

        const args = ['util', 'ai-explain', '--issue-json-file', tempFile, '-f', outputFile];
        try {
            await this.executeScannerCall(xygeniInstallPath, args, output);
        } finally {
            fs.promises.unlink(tempFile).catch(() => { /* best-effort cleanup */ });
        }
    }

    

    // call scanner executable at xygeniInstallPath from workingDir with args
    private callScanner(xygeniInstallPath: string, args: string[], output: IOutputChannel): Promise<number> {

        if (this.scannerRunning) {
            return Promise.reject('Scanner is already running');
        }
        this.scannerRunning = true;

        return this.executeScannerCall(xygeniInstallPath, args, output)
            .finally(() => {
                this.scannerRunning = false;
            });


    }

    private licenseNote(exitCode: number): string {
        return exitCode === LICENSE_ERROR_EXIT_CODE ? ' - some scan types are not licensed and were skipped' : '';
    }

    // The scan list only shows the note on hover, so repeat it where the scanner output is read.
    private reportLicenseSkips(exitCode: number, output: IOutputChannel): void {
        if (exitCode === LICENSE_ERROR_EXIT_CODE) {
            output.appendLine('Some scan types are not licensed and were skipped; the licensed ones completed (see the LICENSE ERROR lines above).');
        }
    }

    // execute the actual scanner process; resolves with the scanner exit code
    private executeScannerCall(xygeniInstallPath: string, args: string[], output: IOutputChannel): Promise<number> {
        return new Promise((resolve, reject) => {
            
            if (!xygeniInstallPath) {
                reject(new Error('Xygeni scanner path not configured'));
                return;
            }

            const workingDir = this.commands.getWsLocalStorage();
            
            const scannerScriptPath = this.getScannerScriptPath(xygeniInstallPath);

            const env: NodeJS.ProcessEnv = {
                ...process.env,
            };
            
            // Global options go before the command (`xygeni <global> scan ...`); `args` keeps the command
            // first, so the isScanCommand check below still sees it.
            const enabledOptions = GLOBAL_OPTION_TOGGLES
                .filter((toggle) => ConfigManager.getScanFlag(toggle.setting))
                .map((toggle) => toggle.option);
            const additionalGlobalOptions = ConfigManager.getAdditionalGlobalOptions();
            const globalOptions = buildGlobalOptions(enabledOptions, additionalGlobalOptions);
            const blockedOptions = blockedOptionsIn(additionalGlobalOptions);
            if (blockedOptions.length) {
                this.logger.log(`  Ignoring scanner options ${blockedOptions.join(' ')}: -q/--quiet hide the scanner output the extension reads; the API token comes from the Xygeni configuration.`);
            }
            const commandArgs = [...globalOptions, ...args];

            let shellCommand;
            let shellArgs = [];

            // Determine command based on platform
            if (Platform.get() === 'win32') {
                const psPath = this.resolvePowerShell();
                if (!psPath) {
                    reject(new Error(
                        'PowerShell not found. Xygeni needs Windows PowerShell or PowerShell 7 ' +
                        'to launch the scanner. Ensure %SystemRoot%\\System32\\WindowsPowerShell\\v1.0 ' +
                        'is on PATH, or install PowerShell 7 from https://aka.ms/powershell. ' +
                        '(Searched: ' + this.cachedPowerShellProbed.join(', ') + ')'
                    ));
                    return;
                }
                shellCommand = psPath;
                shellArgs = ["-NoProfile","-ExecutionPolicy", "Bypass", "-File", scannerScriptPath, ...commandArgs];
            }
            else {
                shellCommand = scannerScriptPath;
                shellArgs = [...commandArgs];

            }

            this.logger.log(`  Xygeni Working dir: ${workingDir}`);
            this.logger.log('  Running scanner command: ' + shellCommand + ' ' + shellArgs.join(' '));

            this.getEnvVariables(env).then((env) => {

                // Reports land in workingDir as `<type>.<suffix>`; one dated after this start proves
                // that the licensed scan types ran when the exit code is 127.
                const isScanCommand = args[0] === 'scan';
                const startTime = reportFreshnessStartTime();
                let sawCertificateError = false;
                let unknownOption: string | undefined; // picocli: "Unknown option: '--x'" (exit code 2)
                let previousTail = ''; // a marker may be split across two output chunks

                const scannerProcess = spawn(shellCommand, shellArgs, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false, // Disable shell for cross-platform compatibility and security
                    cwd: workingDir,
                    env: env
                });

                const onOutput = (data: Buffer) => {
                    const text = this.stripAnsiEscapeSequences(data.toString());
                    sawCertificateError = sawCertificateError || isCertificateError(previousTail + text);
                    unknownOption = unknownOption ?? /Unknown options?: '([^']+)'/.exec(previousTail + text)?.[1];
                    previousTail = text.slice(-100);
                    output.append(text);
                };
                scannerProcess.stdout.on('data', onOutput);
                scannerProcess.stderr.on('data', onOutput);

                scannerProcess.on('close', (code) => {
                    clearTimeout(timeout);
                    const wroteReportThisRun = isScanCommand && hasReportWrittenSince(workingDir, XYGENI_SCANNER_REPORT_SUFFIX, startTime);
                    if (isCompletedRun(code, isScanCommand, wroteReportThisRun)) {
                        resolve(code as number);
                    } else {
                        if (isScanCommand && code === LICENSE_ERROR_EXIT_CODE) {
                            output.appendLine('Scan finished with exit code 127 and no report was written: the license is missing, expired or locked, or no scan type is licensed.');
                        }
                        if (sawCertificateError && !globalOptions.includes(SKIP_SSL_VERIFY_OPTION)) {
                            this.suggestSkipSslVerify(output);
                        }
                        if (isScanCommand && code === 2 && unknownOption) {
                            // An option the installed scanner does not know, typically one added in Scanner options
                            // that needs a newer scanner: name it instead of the bare exit code (#415).
                            reject(new Error(`The scanner does not accept ${unknownOption}: remove it from Scanner options in the Configuration view, or update the scanner`));
                            return;
                        }
                        reject(new Error(`Scanner process failed with exit code ${code}`));
                    }
                });

                scannerProcess.on('error', (err) => {
                    reject(new Error(`Failed to start scanner process: ${err.message}`));
                });

                const timeout = setTimeout(() => {
                    scannerProcess.kill('SIGTERM');
                    this.logger.log('  Scanner process stopped due to timeout.');
                    reject(new Error('Scanner process timeout'));
                }, this.timeout);
            }).catch((error) => {
                // Without this a failure while preparing the environment (token, proxy, JAVA_HOME) would leave the
                // promise, and the "scanner running" flag, hanging forever.
                reject(error instanceof Error ? error : new Error(String(error)));
            });
        });
    }

    // A TLS-intercepting proxy makes every scanner call fail on the certificate; the user cannot be expected
    // to know the CLI option, so point them at the setting. (xygeni/tech-support#378)
    private suggestSkipSslVerify(output: IOutputChannel): void {
        if (this.skipSslVerifySuggested) { return; } // concurrent scans would repeat it
        this.skipSslVerifySuggested = true;
        const message = 'The Xygeni scanner could not validate the server SSL certificate. If you are behind a corporate proxy '
            + 'that inspects TLS traffic, enable "Skip SSL Verification" in the Xygeni Configuration.';
        output.appendLine(message);
        const enable = 'Enable Skip SSL Verification';
        window.showWarningMessage(message, enable).then((choice) => {
            if (choice === enable) {
                vscodeCommands.executeCommand(COMMAND_TOGGLE_GLOBAL_OPTION, 'skipSslVerify');
            }
        });
    }

    private resolvePowerShell(): string | undefined {
        if (this.cachedPowerShellPath !== null) {
            return this.cachedPowerShellPath || undefined;
        }
        const result = Platform.resolveWindowsShell();
        this.cachedPowerShellPath = result.path ?? undefined;
        this.cachedPowerShellProbed = result.probed;
        return this.cachedPowerShellPath;
    }

    private resolveJavaHome(): string | undefined {
        if (this.cachedJavaHome !== null) {
            return this.cachedJavaHome || undefined;
        }

        if (process.env.JAVA_HOME) {
            this.cachedJavaHome = process.env.JAVA_HOME;
            return this.cachedJavaHome;
        }

        // On Windows, JAVA_HOME should be in process.env; skip shell resolution
        if (Platform.get() === 'win32') {
            this.cachedJavaHome = undefined;
            return undefined;
        }

        // The user's login shell is asked for the JAVA_HOME its profile sets. The shell is run directly with an
        // argument array, never through a command string: $SHELL is outside the extension's control and must
        // not be interpreted (xygeni/xygeni-product-backlog#2628, CWE-77). Only an absolute, existing path is
        // trusted as the shell; anything else falls back to /bin/bash.
        try {
            const shell = XygeniScannerService.loginShell(process.env.SHELL);
            const result = execFileSync(shell, ['-lc', 'echo "$JAVA_HOME"'], { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (result) {
                this.cachedJavaHome = result;
                return this.cachedJavaHome;
            }
        } catch {
            // ignore
        }
        this.cachedJavaHome = undefined;
        return undefined;
    }

    /** `$SHELL` when it is an absolute path to an existing file, else `/bin/bash`. */
    public static loginShell(shellEnv: string | undefined): string {
        const fallback = '/bin/bash';
        if (!shellEnv || !path.isAbsolute(shellEnv)) { return fallback; }
        try {
            return fs.statSync(shellEnv).isFile() ? shellEnv : fallback;
        } catch {
            return fallback;
        }
    }

    async getEnvVariables(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
        // The scanner sends the token to XYGENI_URL: refuse an http URL the settings do not allow (#1438).
        assertTokenMayBeSentTo(this.commands.getXygeniUrl(), ConfigManager.getAllowInsecureHttp());
        env.XYGENI_URL = this.commands.getXygeniUrl();
        await this.commands.getToken().then(token => env.XYGENI_TOKEN = token);

        const javaHome = this.resolveJavaHome();
        if (javaHome) {
            env.JAVA_HOME = javaHome;
            env.PATH = path.join(javaHome, 'bin') + path.delimiter + (env.PATH || '');
        }

        const proxySettings = this.commands.getProxySettings();

        if (proxySettings.host) {
            env.PROXY_HOST = proxySettings.host;
            if (proxySettings.protocol) {
                env.PROXY_PROTOCOL = proxySettings.protocol;
            }
            if (proxySettings.port) {
                env.PROXY_PORT = proxySettings.port.toString();
            }
            if (proxySettings.authentication) {
                env.PROXY_AUTH = proxySettings.authentication;
            }
            if (proxySettings.username) {
                env.PROXY_USERNAME = proxySettings.username;
            }
            if (proxySettings.password) {
                env.PROXY_PASSWORD = proxySettings.password;
            }
            if (proxySettings.nonProxyHosts) {
                env.NO_PROXY = proxySettings.nonProxyHosts;
            }
        }

        return env;
    }

    private getScannerScriptPath(xygeniScannerPath: string): string {
        return path.join(xygeniScannerPath, this.getScannerScriptName());
    }

    private getScannerScriptName(): string {
        const platform = Platform.get();
        switch (platform) {
            case 'win32':
                return 'xygeni.ps1';
            case 'darwin':
            case 'linux':
                return 'xygeni';
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    private stripAnsiEscapeSequences(text: string): string {
        return text.replace(/\u001b\[m|\u001b\[\d+m/g, '');
    }

}

export default XygeniScannerService;
