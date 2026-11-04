// Options of `xygeni scan` the user may add from the IDE (xygeni/xygeni-product-backlog#415, "scanner options").
//
// A closed list, not free text: the Configuration view offers these with autocompletion and refuses anything
// else, and the same validation runs when `.xygeni/ide.json` is read, so a hand-edited file cannot smuggle in
// an option the plugin manages itself (`--run`, `-o`, ...). Taken from ScanCommand and its option groups in
// DepsDoctor-CLI (`xygeni scan --help`); the kinds decide what the autocompletion suggests after the `=`.

export type ScanOptionKind = 'flag' | 'enum' | 'list' | 'text' | 'path';

export interface ScanOptionSpec {
    /** Long name, with the dashes (`--run-languages`). */
    name: string;
    kind: ScanOptionKind;
    /** One line, as in the CLI help. */
    description: string;
    /** `enum`: the only values accepted. `list`: suggested items (others are accepted too unless `closed`). */
    values?: readonly string[];
    /** `list`: every item must be one of `values`. */
    closed?: boolean;
    placeholder?: string;
}

const LANGUAGES = ['csharp', 'go', 'html', 'java', 'javascript', 'kotlin', 'php', 'python', 'swift', 'typescript'] as const;
const SEVERITIES = ['critical', 'high', 'low', 'info'] as const;

/** The options offered, in the order of the autocompletion. */
export const SCAN_OPTIONS: readonly ScanOptionSpec[] = [
    { name: '--run-languages', kind: 'list', closed: true, values: LANGUAGES, description: 'Languages to analyze (SAST, Code Quality); all if not set', placeholder: 'java,typescript' },
    { name: '--skip-languages', kind: 'list', closed: true, values: LANGUAGES, description: 'Languages to leave out of the analysis', placeholder: 'html' },
    { name: '--include', kind: 'list', description: 'Include patterns, comma-separated (glob, ** at any depth)', placeholder: 'src/**' },
    { name: '--detectors', kind: 'text', description: 'Detectors to include per scan: <scan>=<ids, a severity or all>, | between scans', placeholder: 'secrets=high|iac=all' },
    { name: '--skip-detectors', kind: 'text', description: 'Detectors to leave out per scan, same syntax as --detectors', placeholder: 'sast=hardcoded_password' },
    { name: '--mute', kind: 'path', description: 'Mute descriptor file (.xygeni.mute.yml) or #name of a named profile', placeholder: '.xygeni.mute.yml' },
    { name: '--standard', kind: 'text', description: 'ID of the compliance standard to check', placeholder: 'owasp-top10' },
    { name: '--ai-review', kind: 'enum', values: ['off', 'all', 'ai-detected'], description: 'Which findings an AI agent reviews (needs an AI agent configured)' },
    { name: '--ai-review-filter', kind: 'list', values: SEVERITIES, description: 'Findings the AI review looks at: a severity (that one and higher), detector IDs, !<id> to leave one out, or all', placeholder: 'high,!sql_injection' },
    { name: '--ai-mode', kind: 'enum', values: ['off', 'auto', 'stored', 'rebuild'], description: 'Convention profile of the application before analyzing it (needs an AI agent configured)' },
    { name: '--include-license-analysis', kind: 'flag', description: 'Evaluate the licenses of the components (SCA)' },
    { name: '--conf', kind: 'path', description: 'Scan configuration file template (the filename is prefixed with SCAN.)', placeholder: 'conf/custom.yml' },
    { name: '--custom-detectors-dir', kind: 'path', description: 'Directory with custom detectors', placeholder: '.xygeni/detectors' },
];

/** Options the plugin builds itself or that would break the IDE flow, with the reason shown when typed. */
export const MANAGED_SCAN_OPTIONS: Readonly<Record<string, string>> = {
    '--run': 'chosen with the scan type switches',
    '--skip': 'chosen with the scan type switches',
    '--incremental': 'set by Auto Scan on Save',
    '-d': 'the workspace folder is scanned', '--dir': 'the workspace folder is scanned',
    '-o': 'the report location is managed by the plugin', '--output': 'the report location is managed by the plugin',
    '-f': 'the plugin reads JSON reports', '--format': 'the plugin reads JSON reports',
    '--upload': 'IDE scans are never uploaded', '--no-upload': 'IDE scans are never uploaded',
    '--include-vulnerabilities': 'always set by the plugin',
    '-e': 'replaces the scanner defaults: use Excluded folders instead', '--exclude': 'replaces the scanner defaults: use Excluded folders instead',
    '--exclude-add': 'use Excluded folders', '--exclude-remove': 'use Excluded folders',
    '-n': 'the project is named by the plugin', '--name': 'the project is named by the plugin',
    '--branch': 'the branch is taken from the workspace',
    '-repo': 'the IDE scans the local workspace', '--repository': 'the IDE scans the local workspace',
    '--repo-token': 'the IDE scans the local workspace', '--repo-branch': 'the IDE scans the local workspace',
    '--api-key': 'the token comes from the Xygeni configuration',
    '--never-fail': 'the plugin reads the exit code', '--fail-on': 'the plugin reads the exit code',
    '--try-all-scans': 'the plugin reads the exit code', '--stop-on-errors': 'the plugin reads the exit code',
    '--secrets-mode': 'internal', '--iac-mode': 'internal', '--sast-mode': 'internal', '--malware-mode': 'internal',
    '-b': 'baselines are a CI concern', '--baseline': 'baselines are a CI concern', '--set-baseline': 'baselines are a CI concern',
    '--auto-remediate': 'opens pull requests: a CI option', '--pr-comment': 'comments on pull requests: a CI option', '--triage': 'a CI option',
};

export interface ParsedScanOption {
    name: string;
    /** Absent for a bare option. */
    value?: string;
}

/** `--name`, `--name=value` or `--name value` (one option per entry). */
export function parseScanOption(text: string): ParsedScanOption | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith('-')) { return undefined; }
    const match = /^(-{1,2}[A-Za-z][\w-]*)(?:\s*=\s*|\s+)?(.*)$/s.exec(trimmed);
    if (!match) { return undefined; }
    const name = match[1];
    const rest = match[2].trim();
    return rest.length > 0 ? { name, value: rest } : { name };
}

export function findScanOption(name: string): ScanOptionSpec | undefined {
    return SCAN_OPTIONS.find((option) => option.name === name);
}

export type ScanOptionValidation = { ok: true; option: string; spec: ScanOptionSpec } | { ok: false; error: string };

/**
 * Checks one entry and gives its canonical form (`--name=value`, or `--name` for a flag). Refuses what is not in
 * SCAN_OPTIONS, saying why when the plugin manages that option itself.
 */
export function validateScanOption(text: string): ScanOptionValidation {
    const parsed = parseScanOption(text);
    if (!parsed) { return { ok: false, error: 'An option starts with -- (type -- to see them)' }; }
    const managed = MANAGED_SCAN_OPTIONS[parsed.name];
    if (managed) { return { ok: false, error: `${parsed.name} is not available here: ${managed}` }; }
    const spec = findScanOption(parsed.name);
    if (!spec) { return { ok: false, error: `${parsed.name} is not an option the IDE can pass to the scanner` }; }
    if (spec.kind === 'flag') {
        return parsed.value === undefined ? { ok: true, option: spec.name, spec } : { ok: false, error: `${spec.name} takes no value` };
    }
    const value = parsed.value?.trim() ?? '';
    if (value.length === 0) { return { ok: false, error: `${spec.name} needs a value${spec.placeholder ? `, like ${spec.placeholder}` : ''}` }; }
    if (spec.kind === 'enum' && !spec.values!.includes(value)) {
        return { ok: false, error: `${spec.name} is one of ${spec.values!.join(', ')}` };
    }
    if (spec.kind === 'list') {
        const items = value.split(',').map((item) => item.trim());
        if (items.some((item) => item.length === 0)) { return { ok: false, error: `${spec.name}: comma-separated values, none empty` }; }
        if (spec.closed) {
            const unknown = items.filter((item) => !spec.values!.includes(item));
            if (unknown.length > 0) { return { ok: false, error: `${spec.name}: ${unknown.join(', ')} not among ${spec.values!.join(', ')}` }; }
        }
        return { ok: true, option: `${spec.name}=${items.join(',')}`, spec };
    }
    if (/\s/.test(value) && !(spec.kind === 'path')) {
        return { ok: false, error: `${spec.name}: no spaces in the value` };
    }
    return { ok: true, option: `${spec.name}=${value}`, spec };
}

/** The option name of a canonical entry (`--ai-review=all` → `--ai-review`). */
export function scanOptionName(entry: string): string {
    return parseScanOption(entry)?.name ?? entry;
}

/** Keeps the valid entries, in canonical form, one per option (the last one wins). */
export function normalizeScanOptions(input: unknown): string[] {
    if (!Array.isArray(input)) { return []; }
    const byName = new Map<string, string>();
    for (const entry of input) {
        if (typeof entry !== 'string') { continue; }
        const result = validateScanOption(entry);
        if (result.ok) { byName.set(result.spec.name, result.option); }
    }
    return SCAN_OPTIONS.filter((spec) => byName.has(spec.name)).map((spec) => byName.get(spec.name)!);
}

/** The entries as CLI arguments (one argument each: the scanner is spawned without a shell). */
export function scanOptionArguments(options: readonly string[]): string[] {
    return normalizeScanOptions([...options]);
}
