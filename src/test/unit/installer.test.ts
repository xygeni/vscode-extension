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

        test('should handle script execution failure', async () => {
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            const mockChildProcess = new MockChildProcess();
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };


            sandbox.stub(Platform, 'get').returns('linux');

            sandbox.stub(require('child_process'), 'spawn').returns(mockChildProcess);

            // Act
            const installPromise = installer.install();

            // Simulate script execution failure
            setTimeout(() => {
                mockChildProcess.stderr.emit('data', Buffer.from('Script failed\n'));
                mockChildProcess.emit('close', 1); // Non-zero exit code
            }, 30);

            // Assert
            await assert.rejects(
                installPromise,
                /Installation script failed/
            );
        });

        test('should handle HTTP redirects', async () => {
            // Arrange
            const scriptUrl = 'https://example.com/install.sh';
            const redirectUrl = 'https://cdn.example.com/install.sh';
            const mockRedirectResponse = new MockResponse(302);
            mockRedirectResponse.headers.location = redirectUrl;

            const mockFinalResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            const mockResponse = new MockResponse(200);
            const mockChildProcess = new MockChildProcess();
            const mockHttpClient = new MockHttpClient(mockResponse, mockRequest);
            commandsMock.getHttpClient = () => mockHttpClient;

            sandbox.stub(Platform, 'get').returns('linux');

            let callCount = 0;
            sandbox.stub(mockHttpClient, 'get').callsFake((url: any, callback: any) => {
                callCount++;
                if (callCount === 1) {
                    setTimeout(() => callback(mockRedirectResponse), 10);
                } else {
                    setTimeout(() => callback(mockFinalResponse), 10);
                }
                return mockRequest as any;
            });

            sandbox.stub(require('child_process'), 'spawn').returns(mockChildProcess);

            // Act
            const installPromise = installer.install();

            // Simulate successful script execution
            setTimeout(() => {
                mockChildProcess.emit('close', 0);
            }, 40);

            // Assert
            await installPromise;

            assert.strictEqual(callCount, 2);
        });

        test('should handle Windows platform correctly', async () => {
            // Arrange
            const scriptUrl = 'https://example.com/install.bat';
            const mockResponse = new MockResponse(200);
            const mockRequest = new MockRequest();
            const mockChildProcess = new MockChildProcess();
            commandsMock.getHttpClient = () => { return new MockHttpClient(mockResponse, mockRequest); };

            sandbox.stub(Platform, 'get').returns('win32');


            const spawnStub = sandbox.stub(require('child_process'), 'spawn').returns(mockChildProcess);

            // Act
            const installPromise = installer.install();

            // Simulate successful script execution
            setTimeout(() => {
                mockChildProcess.emit('close', 0);
            }, 30);

            await installPromise;

            // Assert - should use powershell on Windows
            assert.ok(spawnStub.calledWith('powershell'));
        });


    });


});
