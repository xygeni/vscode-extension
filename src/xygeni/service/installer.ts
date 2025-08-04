import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ILogger, IOutputChannel, EventEmitter } from '../common/interfaces';
import { Platform } from '../common/platform';
import { getHttpClient } from '../common/https';
import { reject } from 'lodash';
import GlobalContext from './global-context';
import { ProxyConfigManager } from '../config/proxy-configuration';
import { Logger } from '../common/logger';


export default class InstallerService {
    private readonly tempDir: string;

    private readonly xygeniGetScannerUrl = 'https://get.xygeni.io/latest/scanner/';


    private static instance: InstallerService;

    public installationRunning: boolean | undefined;
    public status: string | undefined;

    public static getInstance(
        extensionPath?: string,
        logger?: ILogger,
        emitter?: EventEmitter // allow service to isolate from vscode
    ): InstallerService {
        if (!InstallerService.instance) {
            if (extensionPath === undefined) {
                throw new Error('Extension path are required');
            }
            if (logger === undefined) {
                throw new Error('Logger are required');
            }
            if (emitter === undefined) {
                throw new Error('Emitter are required');
            }
            InstallerService.instance = new InstallerService(extensionPath, logger, emitter);
        }
        return InstallerService.instance;
    }

    constructor(
        private readonly extensionPath: string,
        private readonly logger: ILogger,
        private readonly emitter: EventEmitter
    ) {
        this.tempDir = os.tmpdir();
    }

    public getScannerInstallationDir(): string {
        return this.extensionPath + '/.xygeni';
    }

    async install(apiUrl?: string, token?: string, override?: boolean): Promise<void> {

        this.status = 'running';
        this.installationRunning = true;
        this.emitter.emitChange();

        this.logger.log("");
        this.logger.log("================================");
        this.logger.log("  Running scanner installation");
        this.logger.log("");

        try {

            const scannerInstallUrl = `${this.xygeniGetScannerUrl}${this.getInstallName()}`;

            if (!this.isValidUrl(scannerInstallUrl)) {
                throw new Error('Invalid script URL provided');
            }

            this.logger.log(`  Downloading install from: ${scannerInstallUrl}  to: ${this.tempDir}`);

            // Download the install script
            const scriptPath = await this.downloadScript(scannerInstallUrl, this.getInstallName());

            // Make script executable (Unix-like systems)
            if (Platform.get() !== 'win32') {
                await this.makeExecutable(scriptPath);
            }

            const installPath = this.getScannerInstallationDir();

            const args: string[] = [];

            if (token) {
                args.push(`-t '${token}'`);
            }

            if (apiUrl) {
                args.push(`-s '${apiUrl}'`);
            }

            args.push(`-d '${installPath}'`);

            // override installation
            if (override) {
                args.push('-o');
            }

            this.logger.log(`  Executing install script (${scriptPath}) on ${installPath}`);

            // Execute the script
            return this.executeScript(scriptPath, args).then(() => {


                this.status = 'success';
                this.emitter.emitChange();
                //this.logger.log('  Xygeni Scanner installation completed successfully');
                return Promise.resolve();
            })
                .catch((error) => {
                    this.logger.error(error, 'Installation failed');
                    this.status = 'error';
                    this.emitter.emitChange();
                    return Promise.reject(error);
                })
                .finally(() => {
                    // Clean up temporary script file
                    this.cleanup(scriptPath);
                    this.installationRunning = false;
                });





        } catch (error) {
            this.installationRunning = false;
            this.logger.error(error, '  Installation failed');
            this.status = 'error';
            return Promise.reject(error);
        }
    }


    public static async isValidToken(xygeniApiUrl: string, xygeniToken: string): Promise<boolean> {
        const testApiUrl = `${xygeniApiUrl}/language`;
        return new Promise<boolean>((resolve) => {
            const request = getHttpClient(xygeniApiUrl)
                .setAuthToken(xygeniToken)
                .get(testApiUrl, (res) => {
                    resolve(res.statusCode === 200);
                });

            request.on('error', (error) => {
                reject(new Error(`Error checking Xygeni Token: ${error.message}`));
            });
        });

    }

    public static async isValidApiUrl(xygeniApiUrl: string): Promise<boolean> {
        const pingUrl = `${xygeniApiUrl}/ping`;

        return new Promise<boolean>((resolve, reject) => {
            const request = getHttpClient(pingUrl)
                .get(pingUrl, (res) => {
                    //Logger.log(`Xygeni API URL is correct: ${pingUrl} ${res.statusCode}`);
                    if (res.statusCode !== 200) {
                        Logger.log(`Xygeni API URL is not valid or not reachable. ${pingUrl} Errorcode: ${res.statusCode}`);
                    }
                    resolve(res.statusCode === 200);
                });

            request.on('error', (error) => {
                reject(new Error(`Error checking Xygeni API URL: ${error.message}`));
            });
        });

    }

    private isValidUrl(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        } catch {
            return false;
        }
    }



    private async downloadScript(scriptUrl: string, installName: string): Promise<string> {
        return new Promise((resolve, reject) => {

            // local path            
            const scriptPath = path.join(this.tempDir, installName);
            const file = fs.createWriteStream(scriptPath);

            //this.logger.log(`  Downloading install script from: ${scriptUrl}`);

            const client = getHttpClient(scriptUrl);

            const request = client.get(scriptUrl, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        file.close();
                        fs.unlinkSync(scriptPath);
                        this.downloadScript(redirectUrl, installName).then(resolve).catch(reject);
                        return;
                    }
                }

                // Check for successful response
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(scriptPath);
                    reject(new Error(`Failed to download script: HTTP ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(scriptPath);
                });

                file.on('error', (err) => {
                    file.close();
                    fs.unlinkSync(scriptPath);
                    reject(new Error(`File write error: ${err.message}`));
                });
            });

            request.on('error', (err) => {
                file.close();
                if (fs.existsSync(scriptPath)) {
                    fs.unlinkSync(scriptPath);
                }
                reject(new Error(`Download error: ${err.message}`));
            });

            // Set timeout for the request
            request.setTimeout(30000, () => {
                request.destroy();
                file.close();
                if (fs.existsSync(scriptPath)) {
                    fs.unlinkSync(scriptPath);
                }
                reject(new Error('Download timeout: Request took longer than 30 seconds'));
            });
        });
    }

    private getInstallName(): string {
        const platform = Platform.get();
        switch (platform) {
            case 'win32':
                return 'install.ps1';
            case 'darwin':
            case 'linux':
                return 'install.sh';
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    private async makeExecutable(scriptPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.chmod(scriptPath, 0o755, (err) => {
                if (err) {
                    reject(new Error(`Failed to make script executable: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async executeScript(scriptPath: string, extraArgs: string[] = [], outputChannel?: IOutputChannel): Promise<string> {
        return new Promise((resolve, reject) => {
            const platform = Platform.get();
            let command: string;
            let args: string[];

            let installCommand = `${scriptPath} ${extraArgs.join(' ')}`;

            // Determine command based on platform
            if (platform === 'win32') {
                command = 'cmd';
                args = ['/c', installCommand];
            } else {
                command = 'sh';
                args = ['-c', installCommand];
            }

            //this.logger.log(`Executing command: ${command} ${args.join(' ')}`);

            const proxySettings = ProxyConfigManager.getProxySettings();
            const env: NodeJS.ProcessEnv = {
                ...process.env,
            };

            if (proxySettings.host) {
                let proxyUrl = `${proxySettings.protocol}://`;
                if (proxySettings.username && proxySettings.password) {
                    proxyUrl += `${proxySettings.username}:${proxySettings.password}@`;
                }
                proxyUrl += `${proxySettings.host}:${proxySettings.port}`;
                env.XYGENI_PROXY = proxyUrl;
            }

            const installerProcess = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
                env: env
            });

            let stdout = '';
            let stderr = '';

            // Capture stdout
            installerProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;

                // Redirect to output channel if provided, otherwise use logger
                if (outputChannel) {
                    outputChannel.append(this.stripAnsiEscapeSequences(output));
                } else {
                    this.logger.log("");
                    this.logger.log(`[STDOUT] ${output.trim()}`);
                    this.logger.log("");
                }
            });

            // Captursed with 4096 bytes remae stderr
            installerProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;

                // Redirect to output channel if provided, otherwise use logger
                if (outputChannel) {
                    outputChannel.append(output);
                } else {
                    this.logger.log("");
                    this.logger.log(`[STDERR] ${output.trim()}`);
                }
            });

            // Handle process completion
            installerProcess.on('close', (code) => {
                if (code === 0) {
                    //this.logger.log('  Script execution completed successfully.');

                    resolve('success');
                } else {
                    const errorMsg = `Script execution failed with exit code ${code}`;
                    if (stderr) {
                        if (outputChannel) {
                            outputChannel.appendLine(`  Error output: ${stderr}`);
                        } else {
                            this.logger.log(`  Error output: ${stderr}`);
                        }
                    }
                    this.logger.log(errorMsg);
                    reject('error');
                }
            });

            // Handle process errors
            installerProcess.on('error', (err) => {
                this.logger.error(err, `Failed to execute script`);
                reject('error');
            });

            // Set timeout for script execution (10 minutes)
            const timeout = setTimeout(() => {
                installerProcess.kill('SIGTERM');
                this.logger.error(new Error('Script execution timeout: Process took longer than 10 minutes'), `Script execution timeout`);
                reject('error');
            }, 600000);

            installerProcess.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    private async cleanup(scriptPath: string): Promise<void> {
        try {
            if (fs.existsSync(scriptPath)) {
                fs.unlinkSync(scriptPath);
                //this.logger.log('  Temporary script file cleaned up');
            }
        } catch (error) {
            this.logger.error(error, '  Warning: Failed to clean up temporary file');
        }
    }

    private stripAnsiEscapeSequences(text: string): string {
        return text.replace(/\u001b\[m|\u001b\[\d+m/g, '');
    }
}

