import { spawn } from 'child_process';
import EventEmitter from '../common/event-emitter';
import { Commands, ILogger, IOutputChannel, ScanResult, WorkspaceFiles, XyContext } from "../common/interfaces";
import { OutputChannelWrapper } from '../common/logger';
import GlobalContext from './global-context';
import { Platform } from '../common/platform';
import path from 'path';
import { window } from 'vscode';
import { XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from '../common/constants';
import IssuesService from './issues';
import { ProxyConfigManager } from '../config/proxy-configuration';


    /**
     * Run scanner using workspace storage as working directory.
     * Allow only one scanner running at a time.
     * Issues reports are persisted in workspace storage.
     * Scanner command (no report is uploaded, generate issues reports in json format at working directory):
     *   scan --run=deps,secrets,misconf,iac,suspectdeps,sast -f json -o <reportOutputPath> -d <sourceFolder> --no-upload
     */
class XygeniScannerService extends EventEmitter {

    private static instance: XygeniScannerService;

    readonly timeout = 1800000; // 30 minutes
    readonly output_suffix = '/scanner.report.json';

    readonly run_analysis_args = ['scan', '--run=deps,secrets,misconf,iac,suspectdeps,sast', '-f', 'json', '-o',
        XYGENI_SCANNER_REPORT_SUFFIX, '--no-upload', '--include-vulnerabilities'];

    readonly run_rectify_sca_args = ['util', 'rectify', '--sca'];    
    readonly run_rectify_sast_args = ['util', 'rectify', '--sast'];

    private scannerRunning = false;
    private scannerQueue: Array<() => Promise<void>> = [];
    private maxConcurrentScanners = 3;
    private activeScannerCount = 0;

    private exitCode: number | undefined;


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

    async runAnalysis(sourceFolder: string, xygeniScannerPath: string, output: IOutputChannel) {
        
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
        this.logger.log(`Running scan on source folder: ${sourceFolder}`);

        this.scans.push({ timestamp: timestamp, status: 'running', issuesFound: undefined, summary: '' });
        this.emitChange();

        return this.runAnalysisCommand(sourceFolder, xygeniScannerPath, output).then(() => {

            this.logger.log('  Scanner finished');
            this.scans.pop();
            const totalTimeInSeconds = (new Date().getTime() - timestamp.getTime()) / 1000;
            this.scans.push({ timestamp: timestamp, status: 'completed', issuesFound: undefined, summary: 'Duration: ' + totalTimeInSeconds + 's' });

            
            this.exitCode = 0;

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


    public runAnalysisCommand(sourceFolder: string, xygeniInstallPath: string, output: IOutputChannel): Promise<void> {        
        const args = [...this.run_analysis_args, '-d', sourceFolder];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifyScaCommand(filePath: string, dependency: string, xygeniInstallPath: string, output: IOutputChannel): Promise<void> {
        const args = [...this.run_rectify_sca_args, '--file-path', filePath, '--dependency', dependency];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    public runRectifySastCommand(filePath: string, detector: string, line: string, xygeniInstallPath: string, output: IOutputChannel): Promise<void> {
        const args = [...this.run_rectify_sast_args, '--file-path', filePath, '--detector', detector, '--line', line];
        return this.callScanner(xygeniInstallPath, args, output);
    }

    

    // call scanner executable at xygeniInstallPath from workingDir with args
    private callScanner(xygeniInstallPath: string, args: string[], output: IOutputChannel): Promise<void> {
        
        if (this.scannerRunning) {
            return Promise.reject('Scanner is already running');
        }
        this.scannerRunning = true;

        return this.executeScannerCall(xygeniInstallPath, args, output)
            .finally(() => {
                this.scannerRunning = false;
            });
               
        
    }

    // execute the actual scanner process
    private executeScannerCall(xygeniInstallPath: string, args: string[], output: IOutputChannel): Promise<void> {
        return new Promise((resolve, reject) => {
            
            if (!xygeniInstallPath) {
                reject(new Error('Xygeni scanner path not configured'));
                return;
            }

            const workingDir = this.commands.getWsLocalStorage();
            
            const scannerScriptPath = this.getScannerScriptPath(xygeniInstallPath);            
           
            this.logger.log('  Running scanner command ' + scannerScriptPath + ' ' + args.join(' '));
            //this.logger.log(`Running scanner working dir: ${workingDir}`);

            const proxySettings = this.commands.getProxySettings();
            const env: NodeJS.ProcessEnv = {
                ...process.env,
            };

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


            const scannerProcess = spawn(scannerScriptPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
                cwd: workingDir,
                env: env
            });

            scannerProcess.stdout.on('data', (data) => {
                output.append(this.stripAnsiEscapeSequences(data.toString()));
            });

            scannerProcess.stderr.on('data', (data) => {
                output.append(this.stripAnsiEscapeSequences(data.toString()));
            });

            scannerProcess.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== null && (code === 0 || code > 128)) {
                    resolve(); // Scanner process completed successfully
                } else {
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
        });
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
