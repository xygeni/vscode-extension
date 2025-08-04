import { spawn } from 'child_process';
import EventEmitter from '../common/event-emitter';
import { ILogger, IOutputChannel, ScanResult, WorkspaceFiles, XyContext } from "../common/interfaces";
import { OutputChannelWrapper } from '../common/logger';
import GlobalContext from './global-context';
import { Platform } from '../common/platform';
import path from 'path';
import { window } from 'vscode';
import { XYGENI_SCANNER_OUTPUT_NAME, XYGENI_SCANNER_REPORT_SUFFIX } from '../common/constants';
import IssuesService from './issues';
import { ProxyConfigManager } from '../config/proxy-configuration';



class XygeniScannerService extends EventEmitter {

    private static instance: XygeniScannerService;

    readonly timeout = 1800000; // 30 minutes

    readonly output_suffix = '/scanner.report.json';

    private scannerRunning = false;

    private exitCode: number | undefined;


    private scans: ScanResult[] = [];


    public static getInstance(fs?: WorkspaceFiles, logger?: ILogger): XygeniScannerService {
        if (!XygeniScannerService.instance) {
            if (fs === undefined) {
                throw new Error('Workspace files are required');
            }
            if (logger === undefined) {
                throw new Error('Logger are required');
            }
            XygeniScannerService.instance = new XygeniScannerService(fs, logger);
        }
        return XygeniScannerService.instance;
    }

    private constructor(private readonly fs: WorkspaceFiles, private logger: ILogger) {
        super();
    }

    async run(sourceFolder: string, xygeniScannerPath: string, output: OutputChannelWrapper) {
        if (this.scannerRunning) {
            return Promise.resolve('Scanner is already running');
        }
        this.scannerRunning = true;
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


        const workingDir = this.fs.getWsLocalStorage();
        this.logger.log(`Running scanner on folder: ${sourceFolder}. Output path: ${workingDir}`);

        this.scans.push({ timestamp: timestamp, status: 'running', issuesFound: undefined, summary: '' });
        this.emitChange();

        return this.runAnalysis(sourceFolder, xygeniScannerPath, workingDir, output).then(() => {

            this.logger.log('  Scanner finished');
            this.scans.pop();
            const totalTimeInSeconds = (new Date().getTime() - timestamp.getTime()) / 1000;
            this.scans.push({ timestamp: timestamp, status: 'completed', issuesFound: undefined, summary: 'Duration: ' + totalTimeInSeconds + 's' });

            this.scannerRunning = false;
            this.exitCode = 0;

            this.emitChange();

            return;
        }).catch((error) => {
            this.logger.error('Error running scanner', error);
            this.scannerRunning = false;
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

    public getExitCode(): number | undefined {
        return this.exitCode;
    }

    public getScans(): ScanResult[] {
        return this.scans;
    }


    private runAnalysis(sourceFolder: string, xygeniInstallPath: string, workingDir: string, output: OutputChannelWrapper): Promise<void> {
        return new Promise((resolve, reject) => {

            if (!xygeniInstallPath) {
                reject(new Error('Xygeni scanner path not configured'));
                return;
            }

            const scannerScriptPath = this.getScannerScriptPath(xygeniInstallPath);
            const reportOutputPath = XYGENI_SCANNER_REPORT_SUFFIX;


            const args = ['scan', '--run=deps,secrets,misconf,iac,suspectdeps,sast', '-f', 'json', '-o', reportOutputPath, '-d', sourceFolder, '--no-upload'];

            this.logger.log('  Running scanner command ' + scannerScriptPath + ' ' + args.join(' '));

            const proxySettings = ProxyConfigManager.getProxySettings();
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
                    resolve();
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