import * as assert from 'assert';
import {
    MANAGED_SCAN_OPTIONS, SCAN_OPTIONS, normalizeScanOptions, parseScanOption, scanOptionArguments, scanOptionName, validateScanOption
} from '../../xygeni/service/scan-options';
import { defaultScanConfig, isDefaultScanConfig, normalizeScanConfig, parseScanConfig, serializeScanConfig, withScanOption, withoutScanOption } from '../../xygeni/service/scan-config';

/** Scanner options the user may add from the IDE (xygeni/xygeni-product-backlog#415). */
suite('Scan options', () => {

    test('the offered options and the managed ones never overlap', () => {
        for (const spec of SCAN_OPTIONS) {
            assert.strictEqual(MANAGED_SCAN_OPTIONS[spec.name], undefined, `${spec.name} is both offered and managed`);
            assert.ok(spec.name.startsWith('--'), spec.name);
            if (spec.kind === 'enum') { assert.ok(spec.values && spec.values.length > 1, `${spec.name} needs its values`); }
            if (spec.closed) { assert.ok(spec.values && spec.values.length > 0, `${spec.name} is closed without values`); }
        }
    });

    test('parse: --name, --name=value and --name value', () => {
        assert.deepStrictEqual(parseScanOption('--ai-review'), { name: '--ai-review' });
        assert.deepStrictEqual(parseScanOption('--ai-review=all'), { name: '--ai-review', value: 'all' });
        assert.deepStrictEqual(parseScanOption('  --ai-review  all '), { name: '--ai-review', value: 'all' });
        assert.deepStrictEqual(parseScanOption('--run-languages = java, kotlin'), { name: '--run-languages', value: 'java, kotlin' });
        assert.strictEqual(parseScanOption('java'), undefined);
        assert.strictEqual(parseScanOption(''), undefined);
        assert.strictEqual(scanOptionName('--mute=.xygeni.mute.yml'), '--mute');
    });

    test('validate: canonical form for flags, enums, lists, text and paths', () => {
        const ok = (text: string) => { const r = validateScanOption(text); assert.ok(r.ok, `${text}: ${r.ok ? '' : r.error}`); return r.ok ? r.option : ''; };
        const bad = (text: string, part: string) => { const r = validateScanOption(text); assert.ok(!r.ok, `${text} should be refused`); assert.ok(!r.ok && r.error.includes(part), `${text}: ${r.ok ? '' : r.error}`); };
        assert.strictEqual(ok('--include-license-analysis'), '--include-license-analysis');
        bad('--include-license-analysis=yes', 'takes no value');
        assert.strictEqual(ok('--ai-review all'), '--ai-review=all');
        bad('--ai-review=sometimes', 'is one of off, all, ai-detected');
        bad('--ai-review', 'needs a value');
        assert.strictEqual(ok('--run-languages = java, kotlin'), '--run-languages=java,kotlin');
        bad('--run-languages=java,cobol', 'cobol not among');
        bad('--run-languages=java,,kotlin', 'none empty');
        assert.strictEqual(ok('--ai-review-filter=high,!sql_injection'), '--ai-review-filter=high,!sql_injection', 'an open list accepts other items');
        assert.strictEqual(ok('--detectors=secrets=high|iac=all'), '--detectors=secrets=high|iac=all', 'the first = splits name and value');
        bad('--standard=owasp top10', 'no spaces');
        assert.strictEqual(ok('--mute=mutes/my profile.yml'), '--mute=mutes/my profile.yml', 'a path may have spaces');
    });

    test('validate: what the plugin manages and what the scanner does not have are refused with a reason', () => {
        for (const [name, reason] of Object.entries(MANAGED_SCAN_OPTIONS)) {
            const r = validateScanOption(`${name}=x`);
            assert.ok(!r.ok && r.error.includes(reason), name);
        }
        const unknown = validateScanOption('--turbo');
        assert.ok(!unknown.ok && unknown.error.includes('--turbo'));
        const notAnOption = validateScanOption('java');
        assert.ok(!notAnOption.ok && notAnOption.error.includes('--'));
    });

    test('normalize keeps the valid entries in canonical form, one per option, the last one winning', () => {
        assert.deepStrictEqual(normalizeScanOptions(undefined), []);
        assert.deepStrictEqual(normalizeScanOptions('--ai-review=all'), []);
        assert.deepStrictEqual(
            normalizeScanOptions(['--ai-review=all', '--run=secrets', '-o out.json', 42, '--ai-review off', '--include-license-analysis', '--nope']),
            ['--ai-review=off', '--include-license-analysis']);
        assert.deepStrictEqual(scanOptionArguments(['--run-languages = java, kotlin']), ['--run-languages=java,kotlin']);
    });

    test('scan configuration: options are part of ide.json, validated on read, and the defaults have none', () => {
        const parsed = parseScanConfig(JSON.stringify({ options: ['--ai-review=all', '--run=secrets', '--dir=/tmp'] }));
        assert.deepStrictEqual(parsed.options, ['--ai-review=all'], 'a hand-edited file cannot bring managed options in');
        assert.ok(!isDefaultScanConfig(parsed));
        assert.deepStrictEqual(normalizeScanConfig({ scans: ['sast'] }).options, []);

        let config = withScanOption(defaultScanConfig(), '--ai-review=all');
        config = withScanOption(config, '--ai-review=off');
        config = withScanOption(config, '--run-languages=java');
        assert.deepStrictEqual(config.options, ['--run-languages=java', '--ai-review=off'], 'in the order of the option list, replaced by name');
        config = withoutScanOption(config, '--ai-review');
        assert.deepStrictEqual(config.options, ['--run-languages=java']);
        assert.deepStrictEqual(JSON.parse(serializeScanConfig(config)).options, ['--run-languages=java']);
        assert.ok(isDefaultScanConfig(withoutScanOption(config, '--run-languages')));
    });
});
