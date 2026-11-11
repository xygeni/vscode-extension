import * as assert from 'assert';
import { INSECURE_HTTP_REFUSED, assertTokenMayBeSentTo, insecureUrlProblem, isInsecureRemoteUrl, isLoopbackHost } from '../../xygeni/common/insecure-url';

/** Plain-http server URLs send the token in clear (xygeni/xygeni-product-backlog#1438). */
suite('Insecure server URL', () => {

    test('loopback hosts never leave the machine', () => {
        for (const host of ['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]', '0:0:0:0:0:0:0:1']) {
            assert.ok(isLoopbackHost(host), host);
        }
        for (const host of ['xygeni.local', '10.0.0.5', 'api.xygeni.io', 'localhost.evil.com', '127.evil.com', '127.0.0', '']) {
            assert.ok(!isLoopbackHost(host), host);
        }
    });

    test('https and http to loopback are fine; http to any other host is insecure', () => {
        assert.strictEqual(isInsecureRemoteUrl('https://api.xygeni.io'), false);
        assert.strictEqual(isInsecureRemoteUrl('https://xygeni.corp.local:8443/deps-doctor-service'), false);
        assert.strictEqual(isInsecureRemoteUrl('http://localhost:8086/deps-doctor-service'), false, 'our own dev backend');
        assert.strictEqual(isInsecureRemoteUrl('http://127.0.0.1:8086'), false);
        assert.strictEqual(isInsecureRemoteUrl('http://[::1]:8086'), false);
        assert.strictEqual(isInsecureRemoteUrl('http://xygeni.corp.local/deps-doctor-service'), true);
        assert.strictEqual(isInsecureRemoteUrl('http://10.0.0.5:8086'), true);
        assert.strictEqual(isInsecureRemoteUrl('http://api.xygeni.io'), true, 'a missing s is the typical typo');
        assert.strictEqual(isInsecureRemoteUrl(undefined), false);
        assert.strictEqual(isInsecureRemoteUrl('not a url'), false, 'a malformed URL is somebody else\'s error');
        assert.strictEqual(isInsecureRemoteUrl('HTTP://xygeni.corp.local'), true, 'scheme case does not matter');
        assert.strictEqual(isInsecureRemoteUrl('http://[bad'), true, 'an http string that does not parse fails closed');
    });

    test('the scanner environment refuses the token for a refused URL (H2)', () => {
        assert.throws(() => assertTokenMayBeSentTo('http://xygeni.corp.local/deps-doctor-service', false), new RegExp('^Error: Insecure URL'));
        assert.doesNotThrow(() => assertTokenMayBeSentTo('http://xygeni.corp.local/deps-doctor-service', true), 'explicit opt-in');
        assert.doesNotThrow(() => assertTokenMayBeSentTo('http://localhost:8086/deps-doctor-service', false), 'loopback');
        assert.doesNotThrow(() => assertTokenMayBeSentTo('https://api.xygeni.io', false));
    });

    test('the problem is reported unless the user allowed insecure http', () => {
        assert.strictEqual(insecureUrlProblem('http://xygeni.corp.local', false), INSECURE_HTTP_REFUSED);
        assert.strictEqual(insecureUrlProblem('http://xygeni.corp.local', true), undefined);
        assert.strictEqual(insecureUrlProblem('http://localhost:8086', false), undefined);
        assert.strictEqual(insecureUrlProblem('https://api.xygeni.io', false), undefined);
        assert.ok(INSECURE_HTTP_REFUSED.includes('https') && INSECURE_HTTP_REFUSED.includes('Allow insecure HTTP'), 'tells the user both ways out');
    });
});
