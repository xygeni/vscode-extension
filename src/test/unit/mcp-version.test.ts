import * as assert from 'assert';
import { checksumAction, checksumFromFile, compareVersions, isNewerVersion, parseVersion, versionFromFile } from '../../xygeni/service/mcp-version';

/** MCP server update detection (xygeni/xygeni-product-backlog#2382). */
suite('MCP server version', () => {

    test('parseVersion accepts plain versions and ignores prefix and suffix', () => {
        assert.deepStrictEqual(parseVersion('1.2.3'), [1, 2, 3]);
        assert.deepStrictEqual(parseVersion(' v1.2.3\n'), [1, 2, 3]);
        assert.deepStrictEqual(parseVersion('1.2.3-SNAPSHOT'), [1, 2, 3]);
        assert.deepStrictEqual(parseVersion('1.2+build.7'), [1, 2]);
        assert.strictEqual(parseVersion(undefined), undefined);
        assert.strictEqual(parseVersion(''), undefined);
        assert.strictEqual(parseVersion('unknown'), undefined);
        assert.strictEqual(parseVersion('<?xml version="1.0"?><Error>AccessDenied</Error>'), undefined);
    });

    test('compareVersions is numeric and pads missing segments', () => {
        assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
        assert.strictEqual(compareVersions('1.2', '1.2.0'), 0);
        assert.ok(compareVersions('1.2.1', '1.2') > 0);
        assert.ok(compareVersions('unknown', '1.0.0') < 0);
    });

    test('isNewerVersion treats an unknown installed version as outdated and an invalid remote as no update', () => {
        assert.strictEqual(isNewerVersion('1.2.3', '1.2.2'), true);
        assert.strictEqual(isNewerVersion('1.2.2', '1.2.2'), false);
        assert.strictEqual(isNewerVersion('1.2.1', '1.2.2'), false);
        assert.strictEqual(isNewerVersion('1.2.3', undefined), true);
        assert.strictEqual(isNewerVersion('1.2.3', 'unknown'), true);
        assert.strictEqual(isNewerVersion(undefined, '1.2.2'), false);
        assert.strictEqual(isNewerVersion('AccessDenied', undefined), false);
    });

    test('version and checksum files are parsed in the published formats', () => {
        assert.strictEqual(versionFromFile('1.2.2\n'), '1.2.2');
        assert.strictEqual(versionFromFile('\n  v1.2.2  \n'), '1.2.2');
        assert.strictEqual(versionFromFile('<Error><Code>AccessDenied</Code></Error>'), undefined);
        assert.strictEqual(versionFromFile(undefined), undefined);
        const hash = 'A'.repeat(64);
        assert.strictEqual(checksumFromFile(`${hash}  xygeni-mcp-server.jar\n`), hash.toLowerCase());
        assert.strictEqual(checksumFromFile(hash), hash.toLowerCase());
        assert.strictEqual(checksumFromFile('not a checksum'), undefined);
        assert.strictEqual(checksumFromFile('<Error>AccessDenied</Error>'), undefined);
    });

    test('checksumAction: an installed JAR is never replaced without a valid checksum (#2382)', () => {
        const hash = 'a'.repeat(64);
        for (const installed of [true, false]) {
            assert.strictEqual(checksumAction(200, hash, installed), 'verify');
            assert.strictEqual(checksumAction(200, undefined, installed), 'skip', 'unreadable checksum');
            assert.strictEqual(checksumAction(undefined, undefined, installed), 'skip', 'timeout / proxy');
            assert.strictEqual(checksumAction(503, undefined, installed), 'skip', 'server error');
        }
        assert.strictEqual(checksumAction(403, undefined, true), 'skip', 'update without checksum');
        assert.strictEqual(checksumAction(404, undefined, true), 'skip', 'update without checksum');
        assert.strictEqual(checksumAction(403, undefined, false), 'install-unverified', 'first install before #2381 is promoted');
        assert.strictEqual(checksumAction(404, undefined, false), 'install-unverified');
    });
});
