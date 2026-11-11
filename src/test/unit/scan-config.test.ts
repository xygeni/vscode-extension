import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    DEFAULT_FULL_SCAN_TYPES, DEFAULT_ON_SAVE_SCAN_TYPES, defaultScanConfig, isDefaultScanConfig, loadScanConfig,
    normalizeScanConfig, parseScanConfig, saveScanConfig, scanConfigPath, serializeScanConfig, withAllScanTypes,
    withOnSaveType, withScanType, withExclude, withoutExclude, excludePatternForFolder, excludeAddArgument
} from '../../xygeni/service/scan-config';

/** Per-project scan configuration (xygeni/xygeni-product-backlog#415). */
suite('Scan configuration', () => {

    test('defaults are what the plugin always ran', () => {
        const config = defaultScanConfig();
        assert.deepStrictEqual(config.scans, [...DEFAULT_FULL_SCAN_TYPES]);
        assert.deepStrictEqual(config.onSave, [...DEFAULT_ON_SAVE_SCAN_TYPES]);
        assert.deepStrictEqual(config.excludes, []);
        assert.strictEqual(isDefaultScanConfig(config), true);
    });

    test('a missing, empty or broken file gives the defaults', () => {
        assert.deepStrictEqual(parseScanConfig(undefined), defaultScanConfig());
        assert.deepStrictEqual(parseScanConfig(''), defaultScanConfig());
        assert.deepStrictEqual(parseScanConfig('{ not json'), defaultScanConfig());
        assert.deepStrictEqual(parseScanConfig('[1,2]'), defaultScanConfig());
        assert.deepStrictEqual(loadScanConfig(undefined), defaultScanConfig());
    });

    test('normalize keeps CLI order, drops unknown types and ties suspect deps to SCA', () => {
        const config = normalizeScanConfig({ scans: ['ai', 'secrets', 'bogus' as any, 'deps'] });
        assert.deepStrictEqual(config.scans, ['deps', 'secrets', 'suspectdeps', 'ai']);
        assert.deepStrictEqual(normalizeScanConfig({ scans: ['suspectdeps', 'sast'] }).scans, ['sast']);
    });

    test('normalize limits on-save to the file-scoped types that are in the full scan', () => {
        const config = normalizeScanConfig({ scans: ['sast', 'deps'], onSave: ['sast', 'deps', 'secrets', 'quality'] });
        assert.deepStrictEqual(config.onSave, ['sast']);
        assert.deepStrictEqual(normalizeScanConfig({ scans: ['quality'], onSave: ['quality'] }).onSave, ['quality']);
    });

    test('an empty full scan falls back to the defaults and excludes are trimmed and deduplicated', () => {
        const config = normalizeScanConfig({ scans: [], excludes: [' vendor/** ', 'vendor/**', '', 3 as any] });
        assert.deepStrictEqual(config.scans, [...DEFAULT_FULL_SCAN_TYPES]);
        assert.deepStrictEqual(config.excludes, ['vendor/**']);
    });

    test('toggles keep the configuration consistent', () => {
        let config = withScanType(defaultScanConfig(), 'sast', false);
        assert.ok(!config.scans.includes('sast'));
        assert.ok(!config.onSave.includes('sast'), 'on-save follows the full scan');
        config = withScanType(config, 'sast', true);
        assert.ok(config.scans.includes('sast'));
        assert.ok(!config.onSave.includes('sast'), 're-enabling the full scan does not re-enable on-save on its own');
        config = withOnSaveType(config, 'sast', true);
        assert.ok(config.onSave.includes('sast'));
        assert.deepStrictEqual(withOnSaveType(config, 'deps', true).onSave, config.onSave, 'SCA cannot run on save');
        assert.deepStrictEqual(withAllScanTypes(config, true).scans, [...DEFAULT_FULL_SCAN_TYPES]);
        assert.deepStrictEqual(withAllScanTypes(config, false).scans, [...DEFAULT_FULL_SCAN_TYPES], 'clearing never leaves the scanner without types');
    });

    test('excludes: folder patterns, add / remove and the --exclude-add argument', () => {
        const root = path.join(os.tmpdir(), 'project');
        assert.strictEqual(excludePatternForFolder(root, path.join(root, 'vendor')), 'vendor/**');
        assert.strictEqual(excludePatternForFolder(root, path.join(root, 'src', 'legacy')), 'src/legacy/**');
        assert.strictEqual(excludePatternForFolder(root, root), undefined, 'the root itself cannot be excluded');
        assert.strictEqual(excludePatternForFolder(root, path.join(os.tmpdir(), 'other')), undefined, 'outside the workspace');

        let config = withExclude(defaultScanConfig(), 'vendor/**');
        config = withExclude(config, ' **/fixtures/** ');
        config = withExclude(config, 'vendor/**');
        assert.deepStrictEqual(config.excludes, ['vendor/**', '**/fixtures/**']);
        assert.strictEqual(excludeAddArgument(config), '--exclude-add=vendor/**,**/fixtures/**');
        config = withoutExclude(config, 'vendor/**');
        assert.deepStrictEqual(config.excludes, ['**/fixtures/**']);
        assert.strictEqual(excludeAddArgument(withoutExclude(config, '**/fixtures/**')), undefined, 'no excludes, no argument: the scanner defaults apply');
    });

    test('save writes .xygeni/ide.json, keeps the keys it does not know, and never deletes the file', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xygeni-scan-config-'));
        try {
            const config = withScanType(defaultScanConfig(), 'quality', false);
            config.excludes = ['vendor/**'];
            saveScanConfig(root, config);
            const written = fs.readFileSync(scanConfigPath(root), 'utf8');
            assert.strictEqual(written, serializeScanConfig(config));
            assert.deepStrictEqual(JSON.parse(written), { scans: config.scans, onSave: config.onSave, excludes: ['vendor/**'], options: [] });
            assert.deepStrictEqual(loadScanConfig(root), config);

            // A key written by another plugin or a later version survives the next save.
            fs.writeFileSync(scanConfigPath(root), JSON.stringify({ ...JSON.parse(written), future: { x: 1 } }));
            saveScanConfig(root, withExclude(config, 'dist/**'));
            assert.deepStrictEqual(JSON.parse(fs.readFileSync(scanConfigPath(root), 'utf8')).future, { x: 1 });

            // Restore defaults rewrites a committed file instead of deleting it.
            saveScanConfig(root, defaultScanConfig());
            assert.ok(fs.existsSync(scanConfigPath(root)), 'an existing file is not deleted');
            assert.deepStrictEqual(loadScanConfig(root), defaultScanConfig());
            assert.deepStrictEqual(JSON.parse(fs.readFileSync(scanConfigPath(root), 'utf8')).future, { x: 1 });
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('the defaults do not create the file in an untouched project', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xygeni-scan-config-'));
        try {
            saveScanConfig(root, defaultScanConfig());
            assert.strictEqual(fs.existsSync(scanConfigPath(root)), false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('a symlinked .xygeni or ide.json is not written through (it could point outside the project)', function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xygeni-scan-config-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'xygeni-outside-'));
        try {
            const victim = path.join(outside, 'victim.txt');
            fs.writeFileSync(victim, 'keep me');
            fs.mkdirSync(path.join(root, '.xygeni'));
            try {
                fs.symlinkSync(victim, scanConfigPath(root));
            } catch {
                this.skip(); // no symlink permission (Windows without developer mode)
            }
            assert.throws(() => saveScanConfig(root, withScanType(defaultScanConfig(), 'quality', false)), /symbolic link/);
            assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'keep me');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });
});
