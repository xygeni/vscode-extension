import * as assert from 'assert';
import {
  GLOBAL_OPTION_TOGGLES,
  SKIP_SSL_VERIFY_OPTION,
  blockedOptionsIn,
  buildGlobalOptions,
  isCertificateError,
  splitOptions,
} from '../../xygeni/service/scanner-options';

suite('Scanner options Test Suite', () => {

  test('splitOptions splits on whitespace and honours quotes', () => {
    assert.deepStrictEqual(splitOptions(undefined), []);
    assert.deepStrictEqual(splitOptions('   '), []);
    assert.deepStrictEqual(splitOptions(' --skip-update\t-v  '), ['--skip-update', '-v']);
    assert.deepStrictEqual(splitOptions('-cop "a=b c" -cop \'x=y z\''), ['-cop', 'a=b c', '-cop', 'x=y z']);
    assert.deepStrictEqual(splitOptions('-cop key=""'), ['-cop', 'key=']);
    assert.deepStrictEqual(splitOptions('""'), ['']);
  });

  test('buildGlobalOptions puts the checked options first, without duplicates or blocked options', () => {
    assert.deepStrictEqual(buildGlobalOptions([], ''), []);
    assert.deepStrictEqual(buildGlobalOptions([SKIP_SSL_VERIFY_OPTION], ''), [SKIP_SSL_VERIFY_OPTION]);
    assert.deepStrictEqual(buildGlobalOptions([SKIP_SSL_VERIFY_OPTION, '--verbose'], '-cop a=b'),
      [SKIP_SSL_VERIFY_OPTION, '--verbose', '-cop', 'a=b']);
    assert.deepStrictEqual(buildGlobalOptions([SKIP_SSL_VERIFY_OPTION], '--skip-ssl-verify -v'), ['--skip-ssl-verify', '-v']);
    assert.deepStrictEqual(buildGlobalOptions([], '-q --skip-update --quiet'), ['--skip-update']);
    assert.deepStrictEqual(blockedOptionsIn('-q --skip-update --quiet'), ['-q', '--quiet']);
  });

  test('GLOBAL_OPTION_TOGGLES are root options of the CLI and only Skip SSL Verification is always visible', () => {
    assert.deepStrictEqual(GLOBAL_OPTION_TOGGLES.map((toggle) => toggle.option), ['--skip-ssl-verify', '--skip-update', '--verbose']);
    assert.deepStrictEqual(GLOBAL_OPTION_TOGGLES.filter((toggle) => toggle.alwaysVisible).map((toggle) => toggle.setting), ['skipSslVerify']);
  });

  test('the API key never reaches the command line, with or without its value', () => {
    assert.deepStrictEqual(buildGlobalOptions([], '--api-key abc --skip-update'), ['--skip-update']);
    assert.deepStrictEqual(buildGlobalOptions([], '--skip-update --api-key=abc'), ['--skip-update']);
    assert.deepStrictEqual(blockedOptionsIn('--api-key abc -q --api-key=def'), ['--api-key', '-q', '--api-key']);
  });

  test('isCertificateError recognises the JVM TLS validation failures', () => {
    assert.strictEqual(isCertificateError('javax.net.ssl.SSLHandshakeException: PKIX path building failed: '
      + 'sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target'), true);
    assert.strictEqual(isCertificateError('Scan finished with exit code 127'), false);
  });
});
