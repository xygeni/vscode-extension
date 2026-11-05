// Global options of the Xygeni CLI (XygeniScanner.java @Option on the root command, not inherited by
// subcommands): they must go between the launcher and the command (`xygeni <global> scan ...`), or
// picocli rejects them as unknown options of `scan`. The launcher script also hands them to the Updater,
// so --skip-ssl-verify covers the self-update download too. (xygeni/tech-support#378)
export const SKIP_SSL_VERIFY_OPTION = '--skip-ssl-verify';

export interface GlobalOptionToggle {
    /** Key under `xygeni.scan` in the settings. */
    setting: string;
    option: string;
    label: string;
    /** Shown in the Configuration view even when off (the others only while they are on). */
    alwaysVisible: boolean;
}

// The global options offered as checkboxes. Not -q/--quiet: the plugin reads the console output
// (licence lines); not --debug / --no-policy-download: hidden, internal-only in the CLI.
export const GLOBAL_OPTION_TOGGLES: GlobalOptionToggle[] = [
    { setting: 'skipSslVerify', option: SKIP_SSL_VERIFY_OPTION, label: 'Skip SSL Verification', alwaysVisible: true },
    { setting: 'skipUpdate', option: '--skip-update', label: 'Skip Scanner Update', alwaysVisible: false },
    { setting: 'verbose', option: '--verbose', label: 'Verbose Scanner Output', alwaysVisible: false },
];

// Never reach the scanner: -q/--quiet hide the console output the extension reads (licence lines), and the API
// key must not be on the command line (the token already goes in the environment, from the Xygeni configuration).
const BLOCKED_OPTIONS = ['-q', '--quiet'];
const API_KEY_OPTION = '--api-key';

// What a JVM prints when a TLS-intercepting proxy re-signs the traffic with a CA it does not trust.
const CERTIFICATE_ERROR_MARKERS = [
    'PKIX path building failed',
    'unable to find valid certification path',
    'SSLHandshakeException',
];

/**
 * Splits the user's option string like a shell would split words, honouring single and double quotes
 * (`-cop "a=b c"` → ['-cop', 'a=b c']). No expansion of any kind: the scanner is spawned without a shell.
 */
export function splitOptions(text: string | undefined): string[] {
    const tokens: string[] = [];
    if (!text) { return tokens; }
    let current = '';
    let inToken = false;
    let quote: string | null = null;
    for (const ch of text) {
        if (quote) {
            if (ch === quote) { quote = null; } else { current += ch; }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            inToken = true;
        } else if (/\s/.test(ch)) {
            if (inToken) { tokens.push(current); current = ''; inToken = false; }
        } else {
            current += ch;
            inToken = true;
        }
    }
    if (inToken) { tokens.push(current); }
    return tokens;
}

/** The free-text options split into the ones kept and the blocked ones (see BLOCKED_OPTIONS; --api-key with its value). */
function partitionOptions(additionalGlobalOptions: string | undefined): { kept: string[]; blocked: string[] } {
    const kept: string[] = [];
    const blocked: string[] = [];
    const tokens = splitOptions(additionalGlobalOptions);
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (BLOCKED_OPTIONS.includes(token)) {
            blocked.push(token);
        } else if (token === API_KEY_OPTION) {
            blocked.push(token);
            index++; // its value
        } else if (token.startsWith(`${API_KEY_OPTION}=`)) {
            blocked.push(API_KEY_OPTION);
        } else {
            kept.push(token);
        }
    }
    return { kept, blocked };
}

/**
 * The global options to put before the CLI command, from the Scan Settings: the checked options first,
 * then the free-text ones, without repeating an option and without the blocked ones.
 */
export function buildGlobalOptions(enabledOptions: string[], additionalGlobalOptions: string | undefined): string[] {
    const extra = partitionOptions(additionalGlobalOptions).kept;
    return [...enabledOptions.filter((option) => !extra.includes(option)), ...extra];
}

/** The options in the free-text setting that are dropped (see BLOCKED_OPTIONS). */
export function blockedOptionsIn(additionalGlobalOptions: string | undefined): string[] {
    return partitionOptions(additionalGlobalOptions).blocked;
}

export function isCertificateError(output: string): boolean {
    return CERTIFICATE_ERROR_MARKERS.some((marker) => output.includes(marker));
}
