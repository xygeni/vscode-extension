import * as assert from 'assert';
import { EventEmitter as NodeEventEmitter } from 'events';
import LicenseService from '../../xygeni/service/license';
import { Commands, IHttpClient, ILogger } from '../../xygeni/common/interfaces';

class LoggerMock implements ILogger {
    public logs: string[] = [];
    log(message: string): void { this.logs.push(message); }
    error(_error: Error | unknown, message: string): void { this.logs.push(message); }
    showOutput(): void { /* noop */ }
}

class MockResponse extends NodeEventEmitter {
    public statusCode: number;
    constructor(statusCode: number) { super(); this.statusCode = statusCode; }
    resume(): void { /* noop */ }
}

class MockRequest extends NodeEventEmitter { }

class MockHttpClient implements IHttpClient {
    public lastPostUrl: string | undefined;
    public lastToken: string | undefined;
    constructor(private response: MockResponse, private body: string, private request: MockRequest) { }
    setAuthToken(token: string): IHttpClient { this.lastToken = token; return this; }
    get(_url: string, _callback: (res: any) => void): any { return this.request; }
    post(url: string, _data: any, callback: (res: any) => void): any {
        this.lastPostUrl = url;
        setTimeout(() => {
            callback(this.response);
            if (this.response.statusCode === 200) {
                this.response.emit('data', this.body);
                this.response.emit('end');
            }
        }, 5);
        return this.request;
    }
}

function buildCommandsMock(httpClient: MockHttpClient, opts?: { url?: string }): Commands {
    const url = opts && 'url' in opts ? opts.url : 'https://api.xygeni.io';
    return {
        getXygeniUrl: () => url,
        getHttpClient: () => httpClient,
        // No persisted fingerprint: force generateAndEval() so callInstallLicense() runs.
        globalFileExists: (_file: string) => Promise.resolve(false),
        readGlobalFile: (_file: string) => Promise.resolve('{}'),
        storeGlobalFile: (_file: string, _content: string) => { /* noop */ },
    } as unknown as Commands;
}

function resetSingleton() {
    (LicenseService as any).instance = undefined;
}

suite('LicenseService (IDE seat)', () => {

    teardown(() => resetSingleton());

    test('isValidLicense resolves true when /ideaccess returns 200 with body "true"', async () => {
        const client = new MockHttpClient(new MockResponse(200), 'true', new MockRequest());
        const service = LicenseService.getInstance('/ext/path', new LoggerMock(), buildCommandsMock(client));

        const result = await service.isValidLicense('token-123');

        assert.strictEqual(result, true);
        assert.strictEqual(client.lastToken, 'token-123');
        assert.strictEqual(client.lastPostUrl, 'https://api.xygeni.io/internal/license/ideaccess');
    });

    // Regression for issue #401: the endpoint returns 200 with body "false" to deny a seat.
    // A 200 status alone must NOT be treated as a valid license.
    test('isValidLicense resolves false when /ideaccess returns 200 with body "false" (seat denied)', async () => {
        const client = new MockHttpClient(new MockResponse(200), 'false', new MockRequest());
        const service = LicenseService.getInstance('/ext/path', new LoggerMock(), buildCommandsMock(client));

        const result = await service.isValidLicense('token');

        assert.strictEqual(result, false);
    });

    test('isValidLicense ignores whitespace/case in the boolean body', async () => {
        const client = new MockHttpClient(new MockResponse(200), ' TRUE\n', new MockRequest());
        const service = LicenseService.getInstance('/ext/path', new LoggerMock(), buildCommandsMock(client));

        const result = await service.isValidLicense('token');

        assert.strictEqual(result, true);
    });

    test('isValidLicense rejects on non-200 response', async () => {
        const client = new MockHttpClient(new MockResponse(403), '', new MockRequest());
        const service = LicenseService.getInstance('/ext/path', new LoggerMock(), buildCommandsMock(client));

        await assert.rejects(() => service.isValidLicense('token'));
    });

    test('isValidLicense rejects when no Xygeni URL is configured', async () => {
        const client = new MockHttpClient(new MockResponse(200), 'true', new MockRequest());
        const service = LicenseService.getInstance('/ext/path', new LoggerMock(), buildCommandsMock(client, { url: undefined }));

        await assert.rejects(() => service.isValidLicense('token'));
    });
});
