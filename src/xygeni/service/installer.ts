import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { spawn } from 'child_process';
import { ILogger, IOutputChannel, EventEmitter, Commands } from '../common/interfaces';
import { Platform } from '../common/platform';
import { checksumFromFile, isNewerVersion, McpUpdateCheck, versionFromFile } from './mcp-version';

/** What an MCP server download left behind: the JAR in place, or a `.pending` copy while a client locks it. */
export type McpDownloadOutcome = 'installed' | 'pending';

/** Result of `checkMcpUpdate`; the caller decides what to show (xygeni/xygeni-product-backlog#2382). */
export type McpUpdateCheckResult =
    | { status: 'not-installed' }
    | { status: 'skipped' }
    | { status: 'unavailable' }
    | ({ status: 'up-to-date' | 'update-available' } & McpUpdateCheck);


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
    private readonly xygeniScannerChecksumUrl = 'https://raw.githubusercontent.com/xygeni/xygeni/main/checksum/latest/xygeni-release.zip.sha256';


    private readonly xygeniMCPBaseUrl = 'https://get.xygeni.io/latest/mcp-server';
    private readonly xygeniMCPLibraryUrl = `${this.xygeniMCPBaseUrl}/xygeni-mcp-server.jar`;
    // `<hash>  xygeni-mcp-server.jar` and the version on a single line, published with the JAR (#2381).
    private readonly xygeniMCPChecksumUrl = `${this.xygeniMCPBaseUrl}/xygeni-mcp-server.jar.sha256`;
    private readonly xygeniMCPVersionUrl = `${this.xygeniMCPBaseUrl}/version.txt`;
    private readonly xygeniMCPLibraryName = 'xygeni-mcp-server.jar';
    // Installed version, last remote check (shared by every IDE) and an update waiting for a locked JAR (#2382).
    private readonly mcpVersionFileName = 'version.txt';
    private readonly mcpLastCheckFileName = 'last-check.txt';
    private readonly mcpPendingLibraryName = 'xygeni-mcp-server.jar.pending';
    private readonly mcpPendingVersionFileName = 'version.txt.pending';
    private readonly mcpCheckIntervalMs = 24 * 60 * 60 * 1000;
    /** What the last version check found; shown in the MCP Setup view. */
    public lastMcpUpdateCheck: McpUpdateCheck | undefined;
    // Folder the MCP server was installed in before #2382, inside each extension version folder.
    private readonly legacyMcpLibraryFolder = '.xygeni-mcp';
    // The MCP folder is shared by every IDE plugin: the lock keeps two of them from writing the JAR at once.
    private readonly mcpLockName = '.lock';
    private readonly mcpLockStaleMs = 10 * 60 * 1000;
    private readonly mcpLockWaitMs = 2 * 60 * 1000;

    private static instance: InstallerService;

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

    /**
     * The MCP server lives outside the extension folder (~/.xygeni/mcp, shared with the other Xygeni IDE
     * plugins), so the path the user pasted into their MCP client survives extension updates.
     */
    public getMcpLibratyInstallationDir(): string {
        return path.join(os.homedir(), '.xygeni', 'mcp');
    }

    /** Path to the MCP library, or undefined while it is not on disk. */
    public getMcpLibraryPath(): string | undefined {
        const mcpLibraryPath = path.join(this.getMcpLibratyInstallationDir(), this.xygeniMCPLibraryName);
        return fs.existsSync(mcpLibraryPath) ? mcpLibraryPath : undefined;
    }

    public isScannerInstalled(): boolean {
        return fs.existsSync(this.getScannerInstallationDir()) 
            && fs.existsSync(this.getScannerInstallationDir() + '/xygeni');
    }

    public isMcpLibraryInstalled(): boolean {
        return this.getMcpLibraryPath() !== undefined;
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
                    await this.downloadFile(scannerUrl, tempDirPath, this.xygeniScannerZipName, scannerAuthToken);
                }
                else {
                    this.logger.log("    Downloading Xygeni Scanner...");
                    await this.downloadFile(scannerUrl, tempDirPath, this.xygeniScannerZipName);
                    
                    // when downloading from xygeni cloud api - validate scanner zip checksum
                    this.logger.log("    Validating Xygeni Scanner checksum...");
                    await this.downloadFile(this.xygeniScannerChecksumUrl, tempDirPath, this.xygeniScannerZipName + '.sha256');

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

    /** The version written next to the installed JAR, or undefined when the JAR is missing or predates version.txt. */
    public getMcpInstalledVersion(): string | undefined {
        if (!this.isMcpLibraryInstalled()) {
            return undefined;
        }
        return versionFromFile(this.readTextOrUndefined(path.join(this.getMcpLibratyInstallationDir(), this.mcpVersionFileName)));
    }

    /**
     * Makes sure the MCP library is in the shared folder: downloads it when it is missing, or always when
     * `force` is set (reinstall). Legacy copies inside extension folders are removed afterwards.
     * @returns true when a legacy copy was found, so the user must update the path in their MCP client.
     */
    public async downloadMCPLibrary(force?: boolean): Promise<boolean> {
        const installMcpPath = this.getMcpLibratyInstallationDir();
        const mcpLibraryPath = path.join(installMcpPath, this.xygeniMCPLibraryName);
        const legacyMcpLibraryDirs = this.findLegacyMcpLibraryDirs();

        if (force || !fs.existsSync(mcpLibraryPath)) {
            fs.mkdirSync(installMcpPath, { recursive: true });
            await this.withMcpLock(installMcpPath, async () => {
                // Another IDE may have installed it while this one waited for the lock.
                if (!force && fs.existsSync(mcpLibraryPath)) {
                    return;
                }
                this.logger.log("");
                this.logger.log("============================================================");
                const outcome = await this.downloadMcpJarLocked();
                if (outcome === 'installed') {
                    this.logger.log(`  Xygeni MCP Library Downloaded to: ${installMcpPath}`);
                    this.logger.log(`   Check Xygeni MCP Setup to configure it.`);
                }
                this.logger.log("============================================================");
            });
        }

        if (!fs.existsSync(mcpLibraryPath)) {
            this.logger.log(`  MCP Library not found at: ${installMcpPath}. MCP server is not Available.`);
            return false;
        }
        for (const legacyDir of legacyMcpLibraryDirs) {
            this.logger.log(`  Removing previous MCP library folder: ${legacyDir}`);
            try {
                fs.rmSync(legacyDir, { recursive: true, force: true });
            } catch (error: any) {
                // An MCP client still running the old JAR locks it on Windows; it is retried on the next start.
                this.logger.log(`  Could not remove ${legacyDir}: ${error.message}`);
            }
        }
        return legacyMcpLibraryDirs.length > 0;
    }

    /** Downloads the published MCP server over the installed one (the "Update" action). */
    public async updateMcpLibrary(): Promise<McpDownloadOutcome> {
        const installMcpPath = this.getMcpLibratyInstallationDir();
        fs.mkdirSync(installMcpPath, { recursive: true });
        return this.withMcpLock(installMcpPath, () => this.downloadMcpJarLocked());
    }

    /**
     * Downloads the published JAR and puts it in place. Runs under the MCP lock. The remote `version.txt` is
     * read first and written next to the JAR once it is installed; the download is verified against the
     * published `.sha256` when that file is available, and a mismatch keeps the JAR already installed (#2382).
     * On Windows a running MCP client locks the JAR: the download is then kept as `.pending` and applied on
     * the next start.
     */
    private async downloadMcpJarLocked(): Promise<McpDownloadOutcome> {
        const installMcpPath = this.getMcpLibratyInstallationDir();
        const mcpLibraryPath = path.join(installMcpPath, this.xygeniMCPLibraryName);
        const remoteVersion = versionFromFile(await this.fetchText(this.xygeniMCPVersionUrl));
        this.logger.log(`  MCP server published version: ${remoteVersion ?? 'unknown'}`);
        this.logger.log(`  Downloading MCP library... from : ${this.xygeniMCPLibraryUrl}  to: ${installMcpPath}`);

        // Download next to the JAR and rename it into place, so an MCP client never runs a half-written JAR.
        const temporaryPath = await this.downloadFile(this.xygeniMCPLibraryUrl, installMcpPath, this.xygeniMCPLibraryName + '.tmp');
        try {
            const expectedChecksum = checksumFromFile(await this.fetchText(this.xygeniMCPChecksumUrl));
            if (expectedChecksum === undefined) {
                this.logger.log(`  MCP server checksum is not available at ${this.xygeniMCPChecksumUrl}; the download is not verified`);
            } else {
                const actualChecksum = await this.calculateChecksum(temporaryPath);
                if (actualChecksum.toLowerCase() !== expectedChecksum) {
                    throw new Error(`MCP server checksum mismatch (expected ${expectedChecksum}, got ${actualChecksum}); the installed copy is kept`);
                }
                this.logger.log('  MCP server checksum verified');
            }
        } catch (error) {
            fs.rmSync(temporaryPath, { force: true });
            throw error;
        }

        try {
            fs.renameSync(temporaryPath, mcpLibraryPath);
        } catch (error: any) {
            if (!fs.existsSync(mcpLibraryPath)) {
                fs.rmSync(temporaryPath, { force: true });
                throw error;
            }
            // On Windows a running MCP client locks the JAR; the copy already installed keeps working and the
            // update waits as `.pending` until the next start.
            fs.renameSync(temporaryPath, path.join(installMcpPath, this.mcpPendingLibraryName));
            this.writeVersionFile(path.join(installMcpPath, this.mcpPendingVersionFileName), remoteVersion);
            this.logger.log(`  Could not replace ${mcpLibraryPath} (${error.message}). Close your MCP client; the update is applied on the next start.`);
            return 'pending';
        }
        if (Platform.get() !== 'win32') {
            await this.makeExecutable(mcpLibraryPath);
        }
        this.writeVersionFile(path.join(installMcpPath, this.mcpVersionFileName), remoteVersion);
        this.discardPendingMcpUpdate();
        return 'installed';
    }

    /**
     * Compares the installed MCP server with the published one. At most once every 24 h across IDEs unless
     * `force`; a `.pending` download is put in place first when the JAR is no longer locked. A remote version
     * that cannot be read (no network, not published yet) gives `unavailable` and is only logged (#2382).
     */
    public async checkMcpUpdate(force: boolean): Promise<McpUpdateCheckResult> {
        if (!this.isMcpLibraryInstalled()) {
            return { status: 'not-installed' };
        }
        const installMcpPath = this.getMcpLibratyInstallationDir();
        if (fs.existsSync(path.join(installMcpPath, this.mcpPendingLibraryName))) {
            await this.withMcpLock(installMcpPath, async () => this.applyPendingMcpUpdateLocked());
        }
        if (!force && !this.isMcpCheckDue()) {
            return { status: 'skipped' };
        }
        const available = versionFromFile(await this.fetchText(this.xygeniMCPVersionUrl));
        if (available === undefined) {
            this.logger.log(`  MCP server version not available at ${this.xygeniMCPVersionUrl}; update check skipped`);
            return { status: 'unavailable' };
        }
        this.writeTextQuietly(path.join(installMcpPath, this.mcpLastCheckFileName), `${Date.now()}`);
        const installed = this.getMcpInstalledVersion();
        const updateAvailable = isNewerVersion(available, installed);
        this.lastMcpUpdateCheck = { installed, available, updateAvailable };
        this.logger.log(`  MCP server installed: ${installed ?? 'unknown'}, published: ${available}`);
        return { status: updateAvailable ? 'update-available' : 'up-to-date', installed, available, updateAvailable };
    }

    /** Puts a `.pending` download in place once the MCP client that locked the JAR is gone. Under the MCP lock. */
    private applyPendingMcpUpdateLocked(): boolean {
        const installMcpPath = this.getMcpLibratyInstallationDir();
        const pendingPath = path.join(installMcpPath, this.mcpPendingLibraryName);
        const pendingVersionPath = path.join(installMcpPath, this.mcpPendingVersionFileName);
        if (!fs.existsSync(pendingPath)) {
            return false;
        }
        try {
            fs.renameSync(pendingPath, path.join(installMcpPath, this.xygeniMCPLibraryName));
        } catch (error: any) {
            this.logger.log(`  Pending Xygeni MCP server update not applied yet, the JAR is still in use: ${error.message}`);
            return false;
        }
        const pendingVersion = versionFromFile(this.readTextOrUndefined(pendingVersionPath));
        this.writeVersionFile(path.join(installMcpPath, this.mcpVersionFileName), pendingVersion);
        fs.rmSync(pendingVersionPath, { force: true });
        this.logger.log(`  Pending Xygeni MCP server update applied (${pendingVersion ?? 'unknown version'})`);
        return true;
    }

    private discardPendingMcpUpdate(): void {
        const installMcpPath = this.getMcpLibratyInstallationDir();
        fs.rmSync(path.join(installMcpPath, this.mcpPendingLibraryName), { force: true });
        fs.rmSync(path.join(installMcpPath, this.mcpPendingVersionFileName), { force: true });
    }

    private isMcpCheckDue(): boolean {
        const lastCheck = Number(this.readTextOrUndefined(path.join(this.getMcpLibratyInstallationDir(), this.mcpLastCheckFileName))?.trim());
        return !Number.isFinite(lastCheck) || Date.now() - lastCheck > this.mcpCheckIntervalMs;
    }

    /** GET a small text resource (version, checksum); undefined on any failure, which is logged and never thrown. */
    private fetchText(url: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            const finish = (value: string | undefined, reason?: string) => {
                if (reason) {
                    this.logger.log(`  GET ${url}: ${reason}`);
                }
                resolve(value);
            };
            try {
                const request = this.commands.getHttpClient(url).get(url, (response) => {
                    if (response.statusCode !== 200) {
                        response.resume();
                        finish(undefined, `HTTP ${response.statusCode}`);
                        return;
                    }
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                    response.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
                    response.on('error', (error) => finish(undefined, error.message));
                });
                request.on('error', (error) => finish(undefined, error.message));
                // Tiny files read at startup: fail fast rather than hold anything up.
                request.setTimeout(10000, () => {
                    request.destroy();
                    finish(undefined, 'timeout');
                });
            } catch (error: any) {
                finish(undefined, error.message);
            }
        });
    }

    private readTextOrUndefined(filePath: string): string | undefined {
        try {
            return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
        } catch {
            return undefined;
        }
    }

    private writeTextQuietly(filePath: string, content: string): void {
        try {
            fs.writeFileSync(filePath, content);
        } catch (error: any) {
            this.logger.log(`  Could not write ${filePath}: ${error.message}`);
        }
    }

    /** Writes the version next to the JAR; an unknown version removes the file so the next check updates it. */
    private writeVersionFile(filePath: string, version: string | undefined): void {
        if (version === undefined) {
            fs.rmSync(filePath, { force: true });
        } else {
            this.writeTextQuietly(filePath, version + '\n');
        }
    }

    /**
     * MCP library folders left by versions before #2382: `.xygeni-mcp` inside this extension folder and
     * inside the folders of other installed versions of this extension (`<publisher>.<name>-<version>`).
     */
    private findLegacyMcpLibraryDirs(): string[] {
        const extensionFolder = path.basename(this.extensionPath);
        const extensionFolderWithoutVersion = extensionFolder.replace(/-\d+\.\d+\.\d+.*$/, '');
        const candidateFolders = [this.extensionPath];
        if (extensionFolderWithoutVersion !== extensionFolder) {
            const extensionsDir = path.dirname(this.extensionPath);
            for (const folderName of fs.readdirSync(extensionsDir)) {
                if (folderName !== extensionFolder && folderName.startsWith(extensionFolderWithoutVersion + '-')) {
                    candidateFolders.push(path.join(extensionsDir, folderName));
                }
            }
        }
        return candidateFolders
            .map(folder => path.join(folder, this.legacyMcpLibraryFolder))
            .filter(legacyDir => fs.existsSync(path.join(legacyDir, this.xygeniMCPLibraryName)));
    }

    /**
     * Runs `action` holding `<mcpDir>/.lock`, created exclusively. A lock held by another IDE is waited for;
     * one older than `mcpLockStaleMs` was left by a crashed process and is taken over.
     */
    private async withMcpLock<T>(mcpDir: string, action: () => Promise<T>): Promise<T> {
        const lockPath = path.join(mcpDir, this.mcpLockName);
        const waitUntil = Date.now() + this.mcpLockWaitMs;
        for (;;) {
            try {
                fs.writeFileSync(lockPath, `${process.pid}`, { flag: 'wx' });
                break;
            } catch (error: any) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }
            }
            const lockStat = fs.statSync(lockPath, { throwIfNoEntry: false });
            if (lockStat && Date.now() - lockStat.mtimeMs > this.mcpLockStaleMs) {
                fs.rmSync(lockPath, { force: true });
            } else if (Date.now() > waitUntil) {
                throw new Error(`MCP library is being installed by another IDE (${lockPath})`);
            } else if (lockStat) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        try {
            return await action();
        } finally {
            fs.rmSync(lockPath, { force: true });
        }
    }


    /**
     * True for a valid token, false for a refused one. Rejects when the server, not the token, is the problem
     * (5xx or no answer), so the caller can say "server unavailable" instead of "invalid token".
     */
    public async isValidToken(xygeniApiUrl: string, xygeniToken: string): Promise<boolean> {
        const testApiUrl = `${xygeniApiUrl}/language`;
        return new Promise<boolean>((resolve, reject) => {
            const request = this.commands.getHttpClient(xygeniApiUrl)
                .setAuthToken(xygeniToken)
                .get(testApiUrl, (res) => {
                    res.resume?.();
                    if ((res.statusCode ?? 0) >= 500) {
                        reject(new Error(`The Xygeni server is unavailable (HTTP ${res.statusCode}). Try again later.`));
                        return;
                    }
                    resolve(res.statusCode === 200);
                });

            // The previous version used lodash's reject here: a network error never settled the promise.
            request.on('error', (error) => {
                reject(new Error(`The Xygeni server is unreachable (${error.message}). Try again later.`));
            });
        });

    }

    public async isValidApiUrl(xygeniApiUrl: string): Promise<boolean> {
        const pingUrl = `${xygeniApiUrl}/ping`;

        return new Promise<boolean>((resolve, reject) => {
            const request = this.commands.getHttpClient(pingUrl)
                .get(pingUrl, (res) => {
                    // 503 = the server answered but is busy: its /ping reports 503 above a CPU threshold
                    // (PingController.max.cpu). The URL is right; the token check decides. Only an unreachable
                    // host or a wrong path make the URL invalid.
                    if (res.statusCode === 503) {
                        this.logger.log('The Xygeni server is busy (503 on /ping); going on with the token check');
                        resolve(true);
                        return;
                    }
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

                        // Read the raw (still-compressed) entry with decompress:false and inflate
                        // it ourselves in memory. yauzl's streaming inflate deadlocks under
                        // backpressure on large entries on Node >= 24.16 / Electron 42.5+, so we
                        // must consume the read stream without backpressure (never pausing it)
                        // and decompress synchronously. See xygeni/product-backlog#4455.
                        zipfile.openReadStream(entry, { decompress: false, decrypt: null, start: null, end: null }, (err, readStream) => {
                            if (err) {
                                return reject(err);
                            }
                            if (!readStream) {
                                return reject(new Error(`Could not read stream for entry: ${entry.fileName}`));
                            }

                            const chunks: Buffer[] = [];
                            readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
                            readStream.on('error', (err) => reject(err));
                            readStream.on('end', () => {
                                try {
                                    const raw = Buffer.concat(chunks);
                                    // compressionMethod 8 = deflate, 0 = stored
                                    const data = entry.compressionMethod === 8 ? zlib.inflateRawSync(raw) : raw;
                                    fs.writeFileSync(filePath, data);
                                    zipfile.readEntry();
                                } catch (inflateErr) {
                                    reject(inflateErr);
                                }
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
