import * as assert from 'assert';
import * as sinon from 'sinon';
import * as os from 'os';
import { EventEmitter as VscodeEventEmitter } from 'events';
import InstallerService from '../../xygeni/service/installer';
import { ILogger, GlobalContext, EventEmitter, IHttpClient, Commands, ScanResult, XygeniMedia } from '../../xygeni/common/interfaces';
import { Platform } from '../../xygeni/common/platform';
import { commands, Event } from 'vscode';
import { ProxySettings } from '../../xygeni/config/xygeni-configuration';
import { AbstractXygeniIssue } from '../../xygeni/service/abstract-issue';
import { getHttpClient } from '../../xygeni/common/https';
import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import * as crypto from 'crypto';
import { buildZip } from './zip-fixture';

// Mock vscode module
class GlobalContextMock implements GlobalContext {


    getExtensionPath(): string {
        return '/path/to/extension';
    }

    updateGlobalStateValue(key: string, value: unknown): Thenable<void> {
        return Promise.resolve();
    }

    getGlobalStateValue(key: string): unknown {
        return undefined;
    }
}

// Mock Logger class
class LoggerMock implements ILogger {
    public logs: string[] = [];

    log(message: string): void {
        console.log(message);
        this.logs.push(message);
    }

    error(error: Error | unknown, message: string): void {
        console.log(message);
        this.logs.push(message);
    }

    showOutput(): void {
        // Mock implementation
    }

    clear(): void {
        this.logs = [];
    }
}

class EventEmitterMock implements EventEmitter {
    emitChange(): void {
        // Mock implementation
    }
}

// Mock child process
class MockChildProcess extends VscodeEventEmitter {
    public stdout = new VscodeEventEmitter();
    public stderr = new VscodeEventEmitter();
    public killed = false;

    kill(signal?: string): boolean {
        this.killed = true;
        this.emit('close', 0);
        return true;
    }
}

// Mock HTTP response
class MockResponse extends VscodeEventEmitter {
    public statusCode: number;
    public headers: { [key: string]: string } = {};

    constructor(statusCode: number = 200) {
        super();
        this.statusCode = statusCode;
    }

    pipe(destination: any): any {
        // Simulate successful pipe
        setTimeout(() => {
            destination.emit('finish');
        }, 10);
        return destination;
    }
}

// Mock HTTP request
class MockRequest extends VscodeEventEmitter {
    private _destroyed = false;

    setTimeout(timeout: number, callback: () => void): void {
        // Don't actually set timeout in tests
    }

    destroy(): void {
        this._destroyed = true;
        this.emit('error', new Error('Request destroyed'));
    }

    get destroyed(): boolean {
        return this._destroyed;
    }
}

// Mock WriteStream
class MockWriteStream extends VscodeEventEmitter {
    public path: string;
    public closed = false;

    constructor(path: string) {
        super();
        this.path = path;
    }

    close(): void {
        this.closed = true;
        this.emit('close');
    }

    write(data: any, cb?: any): boolean {
        if (cb) { cb(); }
        return true;
    }

    end(cb?: any): void {
        if (cb) { cb(); }
        this.emit('finish');
    }
}


// Mock HTTP Client
class MockHttpClient implements IHttpClient {
    private mockResponse: MockResponse;
    private mockRequest: MockRequest;
    private shouldError: boolean;
    private errorMessage: string;

    constructor(response: MockResponse, request: MockRequest, shouldError = false, errorMessage = '') {
        this.mockResponse = response;
        this.mockRequest = request;
        this.shouldError = shouldError;
        this.errorMessage = errorMessage;
    }

    get(url: string, callback: (res: any) => void): any {
        if (this.shouldError) {
            setTimeout(() => this.mockRequest.emit('error', new Error(this.errorMessage)), 10);
        } else {
            setTimeout(() => callback(this.mockResponse), 10);
        }
        return this.mockRequest;
    }

    post(url: string, data: any, callback: (res: any) => void): any {
        if (this.shouldError) {
            setTimeout(() => this.mockRequest.emit('error', new Error(this.errorMessage)), 10);
        } else {
            setTimeout(() => callback(this.mockResponse), 10);
        }
        return this.mockRequest;
    }

    setAuthToken(token: string): IHttpClient {
        return this;
    }
}

class MockXygeniMedia implements XygeniMedia {
    getIconPath(iconname: string): string {
        return '';
    }

    getIconsPath(): string {
        return '';
    }
    getXygeniCss(): string {
        return '';
    }
}


suite('Installer Test Suite', () => {
    let installer: InstallerService;
    let loggerMock: LoggerMock;
    let emitterMock: EventEmitterMock;
    let commandsMock: Commands;
    let globalContextMock: GlobalContextMock;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Create a temporary directory ramdomly
        const tempDir = os.tmpdir() + '/' + Math.floor(Math.random() * 1000);
        console.log(`Created temp directory: ${tempDir}`);


        // Mock the Logger import
        loggerMock = new LoggerMock();
        emitterMock = new EventEmitterMock();
        globalContextMock = new GlobalContextMock();
        commandsMock = {
            getToken: () => { },
            getXygeniUrl: () => { },
            getHttpClient: () => { return new MockHttpClient(new MockResponse(), new MockRequest()); },
            getProxySettings: () => { return {}; },
        } as unknown as Commands;

        installer = new InstallerService(tempDir, loggerMock, emitterMock, commandsMock);
    });

    teardown(() => {
        sandbox.restore();

    });

    suite('install method', () => {

        test('should handle HTTP 404 error', async () => {
            const mockResponse = new MockResponse(404);
            const mockRequest = new MockRequest();
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };

            // Act & Assert
            await assert.rejects(
                installer.install(),
                /Failed to download file: HTTP 404/
            );
        });
        test('should handle checksum validation failure', async () => {
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };

            sandbox.stub(installer as any, 'downloadFile').callsFake((url: any, targetDir: any, name: any) => {
                const filePath = path.join(targetDir, name);
                fs.writeFileSync(filePath, 'expected-checksum');
                return Promise.resolve(filePath);
            });
            sandbox.stub(installer as any, 'calculateChecksum').resolves('wrong-checksum');

            // Act & Assert
            await assert.rejects(
                installer.install(),
                /Checksum validation failed/
            );
        });

        test('should handle unzip failure', async () => {
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };

            sandbox.stub(installer as any, 'downloadFile').callsFake((url: any, targetDir: any, name: any) => {
                const filePath = path.join(targetDir, name);
                fs.writeFileSync(filePath, 'matching-checksum');
                return Promise.resolve(filePath);
            });
            sandbox.stub(installer as any, 'calculateChecksum').resolves('matching-checksum');
            sandbox.stub(installer as any, 'unzip').rejects(new Error('Unzip failed'));

            // Act & Assert
            await assert.rejects(
                installer.install(),
                /Unzip failed/
            );
        });

        test('should handle network error during download', async () => {
            const mockRequest = new MockRequest();
            const mockResponse = new MockResponse(401);
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };

            // Act & Assert
            await assert.rejects(
                installer.install(),
                /Error: Failed to download file: HTTP 401/
            );
        });

        test('should handle HTTP redirects', async () => {
            // Arrange
            const redirectUrl = 'https://cdn.example.com/xygeni_scanner.zip';
            sandbox.stub(Platform, 'get').returns('linux');
            
            // Stub downloadFile to avoid real network but simulate file creation
            let callCount = 0;
            sandbox.stub(installer as any, 'downloadFile').callsFake((url: any, targetDir: any, name: any) => {
                callCount++;
                if (callCount === 1 && url.includes('xygeni_scanner.zip') && !url.includes('cdn')) {
                    // simulate redirect by having subsequent calls
                    return (installer as any).downloadFile(redirectUrl, targetDir, name);
                }
                const filePath = path.join(targetDir, name);
                fs.writeFileSync(filePath, 'hash');
                return Promise.resolve(filePath);
            });

            // Stub subsequent steps
            sandbox.stub(installer as any, 'calculateChecksum').resolves('hash');
            sandbox.stub(installer as any, 'unzip').callsFake((zip: any, dest: any) => {
                const root = path.join(dest, 'xygeni_scanner');
                if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
                return Promise.resolve();
            });
            sandbox.stub(installer as any, 'copyDirectoryContents').returns(undefined);
            sandbox.stub(installer as any, 'makeBinaryExecutable').resolves();

            // Act
            await installer.install();

            // Assert
            // 1st call for zip (redirects to 2nd call), 3rd call for checksum
            assert.strictEqual(callCount, 3);
        });

        test('should use API releases endpoint and bearer token for custom API URL', async () => {
            // Arrange
            sandbox.stub(Platform, 'get').returns('linux');

            const downloadFileStub = sandbox.stub(installer as any, 'downloadFile').callsFake(
                (url: any, targetDir: any, name: any, authToken?: any) => {
                    const filePath = path.join(targetDir, name);
                    fs.writeFileSync(filePath, 'matching-hash');
                    return Promise.resolve(filePath);
                }
            );
            sandbox.stub(installer as any, 'calculateChecksum').resolves('matching-hash');
            sandbox.stub(installer as any, 'unzip').callsFake((zip: any, dest: any) => {
                const root = path.join(dest, 'xygeni_scanner');
                if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
                return Promise.resolve();
            });
            sandbox.stub(installer as any, 'copyDirectoryContents').returns(undefined);
            sandbox.stub(installer as any, 'makeBinaryExecutable').resolves();

            // Act
            await installer.install('https://onprem.xygeni.local/api', 'test-token');

            // Assert
            assert.strictEqual(downloadFileStub.callCount, 1);
            assert.strictEqual(downloadFileStub.firstCall.args[0], 'https://onprem.xygeni.local/api/scan/releases/');
            assert.strictEqual(downloadFileStub.firstCall.args[3], 'test-token');
        });

        test('should use public scanner URL without bearer token for default API URL', async () => {
            // Arrange
            sandbox.stub(Platform, 'get').returns('linux');

            const downloadFileStub = sandbox.stub(installer as any, 'downloadFile').callsFake(
                (url: any, targetDir: any, name: any, authToken?: any) => {
                    const filePath = path.join(targetDir, name);
                    fs.writeFileSync(filePath, 'matching-hash');
                    return Promise.resolve(filePath);
                }
            );
            sandbox.stub(installer as any, 'calculateChecksum').resolves('matching-hash');
            sandbox.stub(installer as any, 'unzip').callsFake((zip: any, dest: any) => {
                const root = path.join(dest, 'xygeni_scanner');
                if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
                return Promise.resolve();
            });
            sandbox.stub(installer as any, 'copyDirectoryContents').returns(undefined);
            sandbox.stub(installer as any, 'makeBinaryExecutable').resolves();

            // Act
            await installer.install('https://api.xygeni.io/', 'test-token');

            // Assert
            assert.strictEqual(downloadFileStub.callCount, 2);
            assert.strictEqual(downloadFileStub.firstCall.args[0], 'https://get.xygeni.io/latest/scanner/xygeni_scanner.zip');
            assert.strictEqual(downloadFileStub.firstCall.args[3], undefined);
            assert.strictEqual(downloadFileStub.secondCall.args[0], 'https://raw.githubusercontent.com/xygeni/xygeni/main/checksum/latest/xygeni-release.zip.sha256');
            assert.strictEqual(downloadFileStub.secondCall.args[3], undefined);
        });

        test('should require token for custom API URL scanner download', async () => {
            await assert.rejects(
                installer.install('https://onprem.xygeni.local/api'),
                /Xygeni token is required to download scanner from custom API URL/
            );
        });

        test('should install successfully', async () => {
            // Arrange
            sandbox.stub(Platform, 'get').returns('linux');
            
            sandbox.stub(installer as any, 'downloadFile').callsFake((url: any, targetDir: any, name: any) => {
                const filePath = path.join(targetDir, name);
                fs.writeFileSync(filePath, 'matching-hash');
                return Promise.resolve(filePath);
            });
            sandbox.stub(installer as any, 'calculateChecksum').resolves('matching-hash');
            sandbox.stub(installer as any, 'unzip').callsFake((zip: any, dest: any) => {
                const root = path.join(dest, 'xygeni_scanner');
                if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
                return Promise.resolve();
            });
            sandbox.stub(installer as any, 'copyDirectoryContents').returns(undefined);
            const makeExecStub = sandbox.stub(installer as any, 'makeBinaryExecutable').resolves();

            // Act
            await installer.install();

            // Assert
            assert.strictEqual(installer.status, 'success');
            assert.ok(makeExecStub.calledOnce);
        });

        test('should not make executable on Windows', async () => {
            // Arrange
            sandbox.stub(Platform, 'get').returns('win32');
            
            sandbox.stub(installer as any, 'downloadFile').callsFake((url: any, targetDir: any, name: any) => {
                const filePath = path.join(targetDir, name);
                fs.writeFileSync(filePath, 'hash');
                return Promise.resolve(filePath);
            });
            sandbox.stub(installer as any, 'calculateChecksum').resolves('hash');
            sandbox.stub(installer as any, 'unzip').callsFake((zip: any, dest: any) => {
                const root = path.join(dest, 'xygeni_scanner');
                if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
                return Promise.resolve();
            });
            sandbox.stub(installer as any, 'copyDirectoryContents').returns(undefined);
            const makeExecStub = sandbox.stub(installer as any, 'makeBinaryExecutable').resolves();

            // Act
            await installer.install();

            // Assert
            assert.ok(makeExecStub.notCalled);
        });
    });

    suite('unzip method (regression)', () => {
        // Directories created per-test so we can clean them up afterwards.
        const workDirs: string[] = [];

        function makeWorkDir(): string {
            const dir = path.join(os.tmpdir(), `xygeni_unzip_test_${crypto.randomBytes(6).toString('hex')}`);
            fs.mkdirSync(dir, { recursive: true });
            workDirs.push(dir);
            return dir;
        }

        function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
            let timer: NodeJS.Timeout;
            const guard = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), ms);
            });
            return Promise.race([promise, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
        }

        teardown(() => {
            for (const dir of workDirs.splice(0)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });

        // Regression guard for the scanner-install hang: yauzl's streaming inflate
        // deadlocks on large entries under some runtimes (observed on VS Code's
        // Electron / Node 24 build), stopping a few KB short of the declared
        // uncompressed size and never emitting 'end'. The scanner ships a ~34 MB
        // jar, so unzip() must fully extract a large deflate entry, byte-for-byte,
        // without hanging. A ~12 MB random (poorly compressible) entry keeps the
        // read range well above the size that triggers the deadlock. This passes
        // on runtimes where unzip works and fails (via the timeout below) on ones
        // where it hangs.
        test('extracts a large deflate entry completely without hanging', async function () {
            this.timeout(60000);

            const bigSize = 12 * 1024 * 1024;
            const bigData = crypto.randomBytes(bigSize);
            const bigSha = crypto.createHash('sha256').update(bigData).digest('hex');
            const scriptData = Buffer.from('#!/bin/sh\necho xygeni\n');

            const zipBuffer = buildZip([
                { name: 'xygeni_scanner/' },
                { name: 'xygeni_scanner/conf/' },
                { name: 'xygeni_scanner/xygeni', data: scriptData },
                { name: 'xygeni_scanner/lib/big.jar', data: bigData },
            ]);

            const workDir = makeWorkDir();
            const zipPath = path.join(workDir, 'xygeni_scanner.zip');
            const destDir = path.join(workDir, 'out');
            fs.writeFileSync(zipPath, zipBuffer);
            fs.mkdirSync(destDir, { recursive: true });

            await withTimeout(
                (installer as any).unzip(zipPath, destDir),
                30000,
                'unzip() did not finish in 30s — streaming inflate hung on the large entry'
            );

            const bigPath = path.join(destDir, 'xygeni_scanner', 'lib', 'big.jar');
            const scriptPath = path.join(destDir, 'xygeni_scanner', 'xygeni');

            assert.ok(fs.existsSync(bigPath), 'big.jar was not extracted');
            const extracted = fs.readFileSync(bigPath);
            assert.strictEqual(extracted.length, bigSize, 'big.jar was truncated');
            assert.strictEqual(
                crypto.createHash('sha256').update(extracted).digest('hex'),
                bigSha,
                'big.jar contents do not match the original'
            );

            assert.ok(fs.existsSync(scriptPath), 'small entry was not extracted');
            assert.strictEqual(fs.readFileSync(scriptPath).toString(), scriptData.toString());
            assert.ok(fs.existsSync(path.join(destDir, 'xygeni_scanner', 'conf')), 'directory entry was not created');
        });

        test('extracts small entries and directories correctly', async function () {
            this.timeout(20000);

            const zipBuffer = buildZip([
                { name: 'xygeni_scanner/' },
                { name: 'xygeni_scanner/conf/' },
                { name: 'xygeni_scanner/conf/xygeni.yml', data: Buffer.from('scan: true\n') },
                { name: 'xygeni_scanner/xygeni', data: Buffer.from('#!/bin/sh\n') },
            ]);

            const workDir = makeWorkDir();
            const zipPath = path.join(workDir, 'xygeni_scanner.zip');
            const destDir = path.join(workDir, 'out');
            fs.writeFileSync(zipPath, zipBuffer);
            fs.mkdirSync(destDir, { recursive: true });

            await withTimeout((installer as any).unzip(zipPath, destDir), 10000, 'unzip() hung on small entries');

            assert.strictEqual(
                fs.readFileSync(path.join(destDir, 'xygeni_scanner', 'conf', 'xygeni.yml')).toString(),
                'scan: true\n'
            );
            assert.ok(fs.existsSync(path.join(destDir, 'xygeni_scanner', 'xygeni')));
        });
    });

    suite('validation methods', () => {
        test('isValidToken should return true for status 200', async () => {
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            const mockHttpClient = new MockHttpClient(mockResponse, mockRequest);
            commandsMock.getHttpClient = () => mockHttpClient;

            const result = await installer.isValidToken('http://api', 'token');
            assert.strictEqual(result, true);
        });

        test('isValidToken rejects with "server unavailable" on a 5xx, so it is not reported as a bad token', async () => {
            const mockHttpClient = new MockHttpClient(new MockResponse(503), new MockRequest());
            commandsMock.getHttpClient = () => mockHttpClient;
            await assert.rejects(installer.isValidToken('http://api', 'token'), /unavailable \(HTTP 503\)/);
        });

        test('isValidToken rejects (instead of hanging) when the request fails', async () => {
            const mockRequest = new MockRequest();
            const mockHttpClient = new MockHttpClient(new MockResponse(200), mockRequest);
            mockHttpClient.get = (_url: string, _callback: any) => {
                setTimeout(() => mockRequest.emit('error', new Error('ECONNREFUSED')), 5);
                return mockRequest as any;
            };
            commandsMock.getHttpClient = () => mockHttpClient;
            await assert.rejects(installer.isValidToken('http://api', 'token'), /unreachable \(ECONNREFUSED\)/);
        });

        test('isValidToken should return false for non-200 status', async () => {
            const mockResponse = new MockResponse(401);
            const mockRequest = new MockRequest();
            const mockHttpClient = new MockHttpClient(mockResponse, mockRequest);
            commandsMock.getHttpClient = () => mockHttpClient;

            const result = await installer.isValidToken('http://api', 'token');
            assert.strictEqual(result, false);
        });

        test('isValidApiUrl should return true for status 200', async () => {
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            const mockHttpClient = new MockHttpClient(mockResponse, mockRequest);
            commandsMock.getHttpClient = () => mockHttpClient;

            const result = await installer.isValidApiUrl('http://api');
            assert.strictEqual(result, true);
        });

        test('isValidApiUrl should reject for non-200 status', async () => {
            const mockResponse = new MockResponse(500);
            const mockRequest = new MockRequest();
            const mockHttpClient = new MockHttpClient(mockResponse, mockRequest);
            commandsMock.getHttpClient = () => mockHttpClient;

            await assert.rejects(
                installer.isValidApiUrl('http://api'),
                /Error checking Xygeni API URL: 500/
            );
        });
    });

    /**
     * MCP server download (#2382): an installed JAR is never replaced with an unverified one, and the shared lock keeps
     * two IDEs from installing at once. The installer runs against a temporary folder instead of ~/.xygeni/mcp.
     */
    suite('MCP server download', () => {
        const goodHash = 'a'.repeat(64);
        let mcpDir: string;
        let jarPath: string;
        let downloadStub: sinon.SinonStub;

        const published = (checksum: { status?: number; body?: string }) => {
            sandbox.stub(installer as any, 'fetchTextWithStatus').callsFake(async (...args: unknown[]) =>
                String(args[0]).endsWith('.sha256') ? checksum : { status: 200, body: '1.2.0\n' });
        };

        setup(() => {
            mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xygeni-mcp-'));
            jarPath = path.join(mcpDir, 'xygeni-mcp-server.jar');
            sandbox.stub(installer, 'getMcpLibratyInstallationDir').returns(mcpDir);
            sandbox.stub(installer as any, 'makeExecutable').resolves();
            downloadStub = sandbox.stub(installer as any, 'downloadFile').callsFake(async (...args: unknown[]) => {
                const target = path.join(String(args[1]), String(args[2]));
                fs.writeFileSync(target, 'new jar');
                return target;
            });
        });

        teardown(() => fs.rmSync(mcpDir, { recursive: true, force: true }));

        test('a checksum mismatch keeps the installed JAR', async () => {
            fs.writeFileSync(jarPath, 'installed jar');
            published({ status: 200, body: `${goodHash}  xygeni-mcp-server.jar` });
            sandbox.stub(installer as any, 'calculateChecksum').resolves('b'.repeat(64));
            await assert.rejects(installer.updateMcpLibrary(), /checksum mismatch/);
            assert.strictEqual(fs.readFileSync(jarPath, 'utf8'), 'installed jar');
            assert.ok(!fs.existsSync(jarPath + '.tmp'), 'the rejected download is removed');
        });

        test('a matching checksum installs the download', async () => {
            fs.writeFileSync(jarPath, 'installed jar');
            published({ status: 200, body: `${goodHash}  xygeni-mcp-server.jar` });
            sandbox.stub(installer as any, 'calculateChecksum').resolves(goodHash.toUpperCase());
            assert.strictEqual(await installer.updateMcpLibrary(), 'installed');
            assert.strictEqual(fs.readFileSync(jarPath, 'utf8'), 'new jar');
        });

        test('an update without a published checksum is not even downloaded', async () => {
            fs.writeFileSync(jarPath, 'installed jar');
            for (const checksum of [{ status: 403 }, { status: 404 }, { status: 503 }, {}, { status: 200, body: '<Error>AccessDenied</Error>' }]) {
                sandbox.restore();
                sandbox.stub(installer, 'getMcpLibratyInstallationDir').returns(mcpDir);
                downloadStub = sandbox.stub(installer as any, 'downloadFile').rejects(new Error('must not download'));
                published(checksum);
                await assert.rejects(installer.updateMcpLibrary(), /installed copy is kept/, JSON.stringify(checksum));
                assert.ok(downloadStub.notCalled, JSON.stringify(checksum));
                assert.strictEqual(fs.readFileSync(jarPath, 'utf8'), 'installed jar');
            }
        });

        test('a first install goes ahead unverified only while the checksum is not published (403/404)', async () => {
            published({ status: 403 });
            assert.strictEqual(await installer.updateMcpLibrary(), 'installed');
            assert.strictEqual(fs.readFileSync(jarPath, 'utf8'), 'new jar');
            assert.strictEqual(installer.lastMcpInstallUnverified, true, 'the user is warned');

            fs.rmSync(jarPath);
            sandbox.restore();
            sandbox.stub(installer, 'getMcpLibratyInstallationDir').returns(mcpDir);
            published({});
            await assert.rejects(installer.updateMcpLibrary(), /nothing installed/, 'no answer: retried at the next start');
            assert.ok(!fs.existsSync(jarPath));
        });

        test('the MCP lock is exclusive: a held lock blocks a second installer', async () => {
            (installer as any).mcpLockWaitMs = 0;
            let secondRan = false;
            await (installer as any).withMcpLock(mcpDir, async () => {
                await assert.rejects((installer as any).withMcpLock(mcpDir, async () => { secondRan = true; }), /being installed by another IDE/);
            });
            assert.strictEqual(secondRan, false);
            assert.ok(!fs.existsSync(path.join(mcpDir, '.lock')), 'released when the action ends');
            let thirdRan = false;
            await (installer as any).withMcpLock(mcpDir, async () => { thirdRan = true; });
            assert.ok(thirdRan, 'the lock is released afterwards');
        });
    });
});
