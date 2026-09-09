import * as assert from 'assert';
import { EventEmitter as NodeEventEmitter } from 'events';
import LicenseStateService from '../../xygeni/service/license-state';
import { Commands, IHttpClient, ILogger } from '../../xygeni/common/interfaces';

class LoggerMock implements ILogger {
    public logs: string[] = [];
    log(message: string): void { this.logs.push(message); }
    error(_error: Error | unknown, message: string): void { this.logs.push(message); }
    showOutput(): void { /* noop */ }
}

class MockResponse extends NodeEventEmitter {
    public statusCode: number;
    public headers: { [key: string]: string } = {};
    constructor(statusCode: number) { super(); this.statusCode = statusCode; }
    resume(): void { /* noop */ }
}

class MockRequest extends NodeEventEmitter { }

class MockHttpClient implements IHttpClient {
    public lastGetUrl: string | undefined;
    public lastToken: string | undefined;
    constructor(private response: MockResponse, private body: string, private request: MockRequest) { }
    setAuthToken(token: string): IHttpClient { this.lastToken = token; return this; }
    get(url: string, callback: (res: any) => void): any {
        this.lastGetUrl = url;
        setTimeout(() => {
            callback(this.response);
            if (this.response.statusCode === 200) {
                this.response.emit('data', this.body);
                this.response.emit('end');
            }
        }, 5);
        return this.request;
    }
    post(_url: string, _data: any, _callback: (res: any) => void): any { return this.request; }
}

const DEFAULT_URL = 'https://api.xygeni.io';
function buildCommandsMock(httpClient: MockHttpClient, xygeniUrl?: string): Commands {
    const resolvedUrl = arguments.length > 1 ? xygeniUrl : DEFAULT_URL;
    return {
        getXygeniUrl: () => resolvedUrl,
        getHttpClient: () => httpClient,
    } as unknown as Commands;
}

function resetSingleton() {
    (LicenseStateService as any).instance = undefined;
}

suite('LicenseStateService', () => {

    teardown(() => resetSingleton());

    test('isFreeLicense returns true when /license/state responds with "free"', async () => {
        const body = JSON.stringify({ dataLicensePlan: { licenseType: 'free' } });
        const client = new MockHttpClient(new MockResponse(200), body, new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        const licenseType = await service.refresh('token-123');

        assert.strictEqual(licenseType, 'free');
        assert.strictEqual(service.isFreeLicense(), true);
        assert.strictEqual(client.lastToken, 'token-123');
        assert.strictEqual(client.lastGetUrl, 'https://api.xygeni.io/license/state');
    });

    test('isFreeLicense is case-insensitive', async () => {
        const body = JSON.stringify({ dataLicensePlan: { licenseType: 'FREE' } });
        const client = new MockHttpClient(new MockResponse(200), body, new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        await service.refresh('token');

        assert.strictEqual(service.isFreeLicense(), true);
    });

    test('isFreeLicense returns false for non-free license types', async () => {
        const body = JSON.stringify({ dataLicensePlan: { licenseType: 'enterprise' } });
        const client = new MockHttpClient(new MockResponse(200), body, new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        await service.refresh('token');

        assert.strictEqual(service.getLicenseType(), 'enterprise');
        assert.strictEqual(service.isFreeLicense(), false);
    });

    test('refresh resolves undefined on non-200 status and treats license as non-free', async () => {
        const client = new MockHttpClient(new MockResponse(401), '', new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        const licenseType = await service.refresh('token');

        assert.strictEqual(licenseType, undefined);
        assert.strictEqual(service.isFreeLicense(), false);
    });

    test('refresh resolves undefined on malformed JSON', async () => {
        const client = new MockHttpClient(new MockResponse(200), '<<not-json>>', new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        const licenseType = await service.refresh('token');

        assert.strictEqual(licenseType, undefined);
        assert.strictEqual(service.isFreeLicense(), false);
    });

    test('refresh returns undefined without firing a request when no Xygeni URL is configured', async () => {
        const client = new MockHttpClient(new MockResponse(200), '{}', new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client, undefined));

        const licenseType = await service.refresh('token');

        assert.strictEqual(licenseType, undefined);
        assert.strictEqual(client.lastGetUrl, undefined);
    });

    test('refresh resolves undefined when request emits "error"', async () => {
        const request = new MockRequest();
        const client = {
            setAuthToken: () => client as unknown as IHttpClient,
            get: (_url: string, _callback: (res: any) => void) => {
                setTimeout(() => request.emit('error', new Error('boom')), 5);
                return request;
            },
            post: () => request,
        } as unknown as IHttpClient;
        const service = LicenseStateService.getInstance(new LoggerMock(), {
            getXygeniUrl: () => 'https://api.xygeni.io',
            getHttpClient: () => client,
        } as unknown as Commands);

        const licenseType = await service.refresh('token');

        assert.strictEqual(licenseType, undefined);
        assert.strictEqual(service.isFreeLicense(), false);
    });

    test('clear() resets the cached license type', async () => {
        const body = JSON.stringify({ dataLicensePlan: { licenseType: 'free' } });
        const client = new MockHttpClient(new MockResponse(200), body, new MockRequest());
        const service = LicenseStateService.getInstance(new LoggerMock(), buildCommandsMock(client));

        await service.refresh('token');
        assert.strictEqual(service.isFreeLicense(), true);

        service.clear();
        assert.strictEqual(service.getLicenseType(), undefined);
        assert.strictEqual(service.isFreeLicense(), false);
    });
});
