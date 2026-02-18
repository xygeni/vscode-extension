import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { ILogger, IOutputChannel, EventEmitter, Commands } from '../common/interfaces';
import { Platform } from '../common/platform';
import { reject } from 'lodash';


/**
 * Service to install Xygeni Scanner
 * Retrieve the install script from the Xygeni resources server https://get.xygeni.io/latest/scanner/
 * The scanner is installed in the .xygeni directory under the extension path folder
 * 
 * Provide isValidUrl method to validate the script URL using /ping endpoint
 * Provide isValidToken method to validate the token using /language endpoint
 */
export default class InstallerService {
    private readonly tempDir: string;

    private readonly xygeniGetScannerUrl = 'https://get.xygeni.io/latest/scanner/';    
    private readonly xygeniDefaultApiUrl = 'https://api.xygeni.io';
    private readonly xygeniApiScannerReleasesPath = 'scan/releases';
    private readonly xygeniScannerZipName = 'xygeni_scanner.zip';
    private readonly xygeniScannerZipRootFolder = 'xygeni_scanner';

    private readonly xygeniMCPLibraryUrl = 'https://get.xygeni.io/latest/mcp-server/xygeni-mcp-server.jar';
    private readonly xygeniMCPLibraryName = 'xygeni-mcp-server.jar';

    private static instance: InstallerService;

    /** Path to the MCP library if downloaded */
    private mcpLibraryPath: string | undefined;

    public installationRunning: boolean | undefined;
    public status: string | undefined;

    public static getInstance(
        extensionPath?: string,
        logger?: ILogger,
        emitter?: EventEmitter,
        commands?: Commands
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
            if (commands === undefined) {
                throw new Error('Commands are required');
            }
            InstallerService.instance = new InstallerService(extensionPath, logger, emitter, commands);
        }
        return InstallerService.instance;
    }

    constructor(
        private readonly extensionPath: string,
        private readonly logger: ILogger,
        private readonly emitter: EventEmitter,
        private readonly commands: Commands
    ) {
        this.tempDir = os.tmpdir();
    }

    public getScannerInstallationDir(): string {
        return this.extensionPath + '/.xygeni';
    }

    public getMcpLibratyInstallationDir(): string {
        return this.extensionPath + '/.xygeni-mcp';
    }

    public getMcpLibraryPath(): string | undefined {
        return this.mcpLibraryPath;
    }

    public isScannerInstalled(): boolean {
        return fs.existsSync(this.getScannerInstallationDir()) 
            && fs.existsSync(this.getScannerInstallationDir() + '/xygeni');
    }

    public isMcpLibraryInstalled(): boolean {
        return this.mcpLibraryPath !== undefined;
    }

    async install(apiUrl?: string, token?: string, override?: boolean): Promise<void> {

        this.status = 'running';
        this.installationRunning = true;
        this.emitter.emitChange();

        this.logger.log("");
        this.logger.log("=== Starting Xygeni Scanner Installation ===");
        this.logger.log("");

        try {
            const installPath = this.getScannerInstallationDir();
            this.logger.log(`    Installing Xygeni at workspace: ${installPath}`);

            // Create a temporary directory for downloading and extracting
            const tempDirPath = path.join(this.tempDir, `xygeni_installer_${Date.now()}`);
            if (!fs.existsSync(tempDirPath)) {
                fs.mkdirSync(tempDirPath, { recursive: true });
            }

            const zipPath = path.join(tempDirPath, this.xygeniScannerZipName);
            const useApiReleasesUrl = this.shouldUseApiReleasesUrl(apiUrl);
            
            let scannerUrl = `${this.xygeniGetScannerUrl}${this.xygeniScannerZipName}`;
            const scannerAuthToken = useApiReleasesUrl ? token : undefined;
            
            if (useApiReleasesUrl) {
                if (!token) {
                    throw new Error('Xygeni token is required to download scanner from custom API URL');
                }                
                scannerUrl = this.buildUrlWithPath(apiUrl!, this.xygeniApiScannerReleasesPath);
            }            

            try {
                if (useApiReleasesUrl) {
                    this.logger.log(`    Downloading Xygeni Scanner from API URL: ${apiUrl}`);
                }
                else {
                    this.logger.log("    Downloading Xygeni Scanner...");
                }
                
                await this.downloadFile(scannerUrl, tempDirPath, this.xygeniScannerZipName, scannerAuthToken);

                if (!useApiReleasesUrl) {
                    const checksumUrl = `${scannerUrl}.sha256`;
                    // when downloading from xygeni cloud api - validate scanner zip checksum
                    this.logger.log("    Validating Xygeni Scanner checksum...");
                    await this.downloadFile(checksumUrl, tempDirPath, this.xygeniScannerZipName + '.sha256', scannerAuthToken);

                    const downloadedChecksum = fs.readFileSync(path.join(tempDirPath, this.xygeniScannerZipName + '.sha256'), 'utf8').trim().split(/\s+/)[0];
                    const fileChecksum = await this.calculateChecksum(zipPath);

                    if (downloadedChecksum.toLowerCase() !== fileChecksum.toLowerCase()) {
                        throw new Error(`Checksum validation failed. Expected: ${downloadedChecksum}, Got: ${fileChecksum}`);
                    }
                    this.logger.log("    Checksum validation successful.");
                }
                
                

                this.logger.log("    Extracting Xygeni Scanner...");
                await this.unzip(zipPath, tempDirPath);

                // Move contents from tempDir/xygeni_scanner to installPath
                const extractedRoot = path.join(tempDirPath, this.xygeniScannerZipRootFolder);
                if (fs.existsSync(extractedRoot) && fs.statSync(extractedRoot).isDirectory()) {
                    this.logger.log("    Moving files to install directory...");

                    // remove installPath if exists, force fresh install
                    if (fs.existsSync(installPath)) {
                        this.logger.log(`    Removing existing installation at: ${installPath}`);
                        fs.rmSync(installPath, { recursive: true, force: true });
                    }
                    fs.mkdirSync(installPath, { recursive: true });

                    this.copyDirectoryContents(extractedRoot, installPath);

                    // Make binaries executable on non-windows
                    if (Platform.get() !== 'win32') {
                        await this.makeBinaryExecutable(installPath);
                    }

                    this.logger.log("");
                    this.logger.log("    Xygeni Scanner installed successfully ");
                    this.logger.log("=============================================");

                    this.status = 'success';
                    this.emitter.emitChange();

                } else {
                    throw new Error(`Expected root folder ${this.xygeniScannerZipRootFolder} not found in the zip file.`);
                }

            } finally {
                // Clean up temp directory
                if (fs.existsSync(tempDirPath)) {
                    fs.rmSync(tempDirPath, { recursive: true, force: true });
                }
                this.installationRunning = false;
            }

        } catch (error: any) {
            this.installationRunning = false;
            this.logger.error(error, '  Installation process failed');
            this.status = 'error';
            this.emitter.emitChange();
            throw error;
        }
    }

    public async downloadMCPLibrary(): Promise<void> {

        
        const installMcpPath = this.getMcpLibratyInstallationDir();
        this.mcpLibraryPath = `${installMcpPath}/${this.xygeniMCPLibraryName}`;

        this.logger.log("");
        this.logger.log("============================================================");

        // remove installPath if exists, force fresh install
        if (fs.existsSync(this.mcpLibraryPath)) {
            this.logger.log(`  Removing existing installation at: ${this.mcpLibraryPath}`);
            fs.rmSync(this.mcpLibraryPath, { recursive: true, force: true });
        }
        // create folder if not yet
        if (!fs.existsSync(installMcpPath)){
            fs.mkdirSync(installMcpPath);
        }

        this.logger.log(`  Downloading MCP library... from : ${this.xygeniMCPLibraryUrl}  to: ${installMcpPath}`);

        // Download the install script
        await this.downloadFile(this.xygeniMCPLibraryUrl, installMcpPath, this.xygeniMCPLibraryName);

        if (!fs.existsSync(this.mcpLibraryPath)) {
            this.logger.log(`  MCP Library not found at: ${installMcpPath}. MCP server is not Available.`);
            return Promise.resolve();
        }
        // Make script executable (Unix-like systems)
        if (Platform.get() !== 'win32') {
            await this.makeExecutable(this.mcpLibraryPath);
        }

        this.logger.log(`  Xygeni MCP Library Downloaded to: ${installMcpPath}`);
        this.logger.log(`   Check Xygeni MCP Setup to configure it.`);
        this.logger.log("============================================================");
        
    }


    public async isValidToken(xygeniApiUrl: string, xygeniToken: string): Promise<boolean> {
        const testApiUrl = `${xygeniApiUrl}/language`;
        return new Promise<boolean>((resolve) => {
            const request = this.commands.getHttpClient(xygeniApiUrl)
                .setAuthToken(xygeniToken)
                .get(testApiUrl, (res) => {
                    resolve(res.statusCode === 200);
                });

            request.on('error', (error) => {
                reject(new Error(`Error checking Xygeni Token: ${error.message}`));
            });
        });

    }

    public async isValidApiUrl(xygeniApiUrl: string): Promise<boolean> {
        const pingUrl = `${xygeniApiUrl}/ping`;

        return new Promise<boolean>((resolve, reject) => {
            const request = this.commands.getHttpClient(pingUrl)
                .get(pingUrl, (res) => {
                    //Logger.log(`Xygeni API URL is correct: ${pingUrl} ${res.statusCode}`);
                    if (res.statusCode !== 200) {
                        reject(new Error(`Error checking Xygeni API URL: ${res.statusCode}`));
                    }
                    resolve(res.statusCode === 200);
                });

            request.on('error', (error) => {
                reject(new Error(`Error checking Xygeni API URL: ${error.message}`));
            });
        });

    }

    private async downloadFile(scriptUrl: string, targetDir: string, installName: string, authToken?: string): Promise<string> {
        return new Promise((resolve, reject) => {

            // local path            
            const filePath = path.join(targetDir, installName);
            const file = fs.createWriteStream(filePath);

            //this.logger.log(`  Downloading install script from: ${scriptUrl}`);

            const client = this.commands.getHttpClient(scriptUrl);
            if (authToken) {
                client.setAuthToken(authToken);
            }

            const request = client.get(scriptUrl, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        file.close();
                        fs.unlinkSync(filePath);
                        this.downloadFile(redirectUrl, targetDir, installName, authToken).then(resolve).catch(reject);
                        return;
                    }
                }

                // Check for successful response
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(filePath);
                    reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(filePath);
                });

                file.on('error', (err) => {
                    file.close();
                    fs.unlinkSync(filePath);
                    reject(new Error(`File write error: ${err.message}`));
                });
            });

            request.on('error', (err) => {
                file.close();
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                reject(new Error(`Download error: ${err.message}`));
            });

            // Set timeout for the request
            request.setTimeout(60000, () => {
                request.destroy();
                file.close();
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                reject(new Error('Download timeout: Request took longer than 60 seconds'));
            });
        });
    }

    private shouldUseApiReleasesUrl(apiUrl?: string): boolean {
        if (!apiUrl) {
            return false;
        }
        return this.normalizeUrl(apiUrl) !== this.normalizeUrl(this.xygeniDefaultApiUrl);
    }

    private normalizeUrl(url: string): string {
        return url.trim().replace(/\/+$/, '');
    }

    private buildUrlWithPath(baseUrl: string, pathSuffix: string): string {
        return `${this.normalizeUrl(baseUrl)}/${pathSuffix}/`;
    }

    private async unzip(zipPath: string, destination: string): Promise<void> {
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    return reject(err);
                }
                if (!zipfile) {
                    return reject(new Error('Could not open zip file'));
                }

                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    const filePath = path.join(destination, entry.fileName);

                    if (/\/$/.test(entry.fileName)) {
                        // Directory
                        if (!fs.existsSync(filePath)) {
                            fs.mkdirSync(filePath, { recursive: true });
                        }
                        zipfile.readEntry();
                    } else {
                        // File
                        // Ensure parent directory exists
                        const parentDir = path.dirname(filePath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }

                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                return reject(err);
                            }
                            if (!readStream) {
                                return reject(new Error(`Could not read stream for entry: ${entry.fileName}`));
                            }

                            const writeStream = fs.createWriteStream(filePath);
                            readStream.pipe(writeStream);

                            writeStream.on('finish', () => {
                                zipfile.readEntry();
                            });

                            writeStream.on('error', (err) => {
                                reject(err);
                            });
                        });
                    }
                });

                zipfile.on('end', () => {
                    resolve();
                });

                zipfile.on('error', (err) => {
                    reject(err);
                });
            });
        });
    }

    private copyDirectoryContents(src: string, dest: string): void {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirectoryContents(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    private async makeBinaryExecutable(installPath: string): Promise<void> {
        const platform = Platform.get();
        if (platform === 'win32') {
            return;
        }

        const scripts = [
            path.join(installPath, 'xygeni'),
            path.join(installPath, 'bin', 'xygeni'),
        ];

        for (const script of scripts) {
            if (fs.existsSync(script)) {
                await this.makeExecutable(script);
            }
        }

        // Also any .sh files and binaries in bin if any
        const binDir = path.join(installPath, 'bin');
        if (fs.existsSync(binDir) && fs.statSync(binDir).isDirectory()) {
            const files = fs.readdirSync(binDir);
            for (const file of files) {
                const filePath = path.join(binDir, file);
                if (file.endsWith('.sh') || !file.includes('.')) {
                    if (fs.statSync(filePath).isFile()) {
                        await this.makeExecutable(filePath);
                    }
                }
            }
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

    private async calculateChecksum(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }


}
