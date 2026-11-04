import { defineConfig } from '@vscode/test-cli';
import * as os from 'os';
import * as path from 'path';

// Short user-data dirs: the socket VS Code creates there has a 103-character limit on macOS.
const userData = (name) => `--user-data-dir=${path.join(os.tmpdir(), `xygeni-${name}-user-data`)}`;

export default defineConfig([
  {
    label: 'e2e',
    files: 'out/test/extension.test.js',
    workspaceFolder: 'src/test/fixtures/workspace',
    launchArgs: [userData('e2e')],
  },
  {
    // Real scan against a Xygeni backend: XYGENI_E2E_URL, XYGENI_E2E_TOKEN and a workspace with findings.
    label: 'real',
    files: 'out/test/real-scan.test.js',
    workspaceFolder: process.env.XYGENI_E2E_WORKSPACE ?? 'src/test/fixtures/workspace',
    launchArgs: [userData('real')],
    mocha: { timeout: 20 * 60_000 },
  },
]);
