import * as fs from 'fs';
import * as path from 'path';

/**
 * Per-project scan configuration (xygeni/xygeni-product-backlog#415): which scan types the full scan and the
 * on-save incremental scan run, and the folders excluded from both. Saved in `.xygeni/ide.json` at the
 * workspace root, the same file the other Xygeni IDE plugins read, so a team can commit it and share it.
 *
 * A missing file or key means the defaults, which are what the plugins always did: every scan type in the
 * full scan, the file-scoped ones on save, nothing excluded.
 */

import { hasUnsafeChars, normalizeScanOptions, scanOptionName } from './scan-options';

export const SCAN_CONFIG_DIR = '.xygeni';
export const SCAN_CONFIG_FILE = 'ide.json';

/** The `--run=` names the scanner CLI accepts. */
export type ScanType = 'deps' | 'secrets' | 'misconf' | 'iac' | 'suspectdeps' | 'sast' | 'malware' | 'quality' | 'apisec' | 'ai';

export interface ScannerOption {
    key: ScanType;
    label: string;
    description: string;
    /** Codicon name. */
    icon: string;
    /** With `--incremental` only these scan the changed files; the rest would scan the whole project on every save. */
    onSave: boolean;
    /** Runs with another scanner and has no switch of its own (suspect deps need the dependencies). */
    runsWith?: ScanType;
}

/** One row per switch, in the order shown. Same labels and descriptions as the Managed CI configuration. */
export const SCANNERS: readonly ScannerOption[] = [
    { key: 'secrets', label: 'Secrets', description: 'Hardcoded credentials and tokens', icon: 'key', onSave: true },
    { key: 'sast', label: 'SAST', description: 'Vulnerabilities in your own code', icon: 'code', onSave: true },
    { key: 'deps', label: 'SCA', description: 'Vulnerable open source dependencies (also suspect dependencies)', icon: 'package', onSave: false },
    { key: 'iac', label: 'IaC', description: 'Terraform, Kubernetes and CloudFormation flaws', icon: 'cloud', onSave: true },
    { key: 'misconf', label: 'CI/CD misconfigurations', description: 'Pipeline and SCM settings', icon: 'git-merge', onSave: false },
    { key: 'malware', label: 'Malware', description: 'Malicious and suspicious packages', icon: 'bug', onSave: true },
    { key: 'quality', label: 'Code Quality', description: 'Maintainability and reliability issues', icon: 'graph', onSave: true },
    { key: 'apisec', label: 'API Security', description: 'Vulnerabilities in your APIs', icon: 'plug', onSave: false },
    { key: 'ai', label: 'AI Security', description: 'OWASP LLM Top 10 risks in your AI code', icon: 'sparkle', onSave: false },
    { key: 'suspectdeps', label: 'Suspect dependencies', description: 'Runs with SCA', icon: 'package', onSave: false, runsWith: 'deps' },
];

/** The scanners with a switch of their own. */
export const SWITCHABLE_SCANNERS: readonly ScannerOption[] = SCANNERS.filter(scanner => !scanner.runsWith);

/** The scan types `--incremental` can restrict to the changed files. */
export const ON_SAVE_SCANNERS: readonly ScannerOption[] = SCANNERS.filter(scanner => scanner.onSave);

/** Every scan type, in the order the `--run=` list always had (the UI order above is a different one). */
export const ALL_SCAN_TYPES: readonly ScanType[] = ['deps', 'secrets', 'misconf', 'iac', 'suspectdeps', 'sast', 'malware', 'quality', 'apisec', 'ai'];

/** What the plugins always ran: every type in the full scan, secrets / IaC / SAST / malware on save. */
export const DEFAULT_FULL_SCAN_TYPES: readonly ScanType[] = ALL_SCAN_TYPES;
export const DEFAULT_ON_SAVE_SCAN_TYPES: readonly ScanType[] = ['secrets', 'iac', 'sast', 'malware'];

export interface ScanConfig {
    /** Scan types of the full scan, in CLI order. Never empty. */
    scans: ScanType[];
    /** Scan types of the on-save incremental scan: a subset of `scans` among the file-scoped types. */
    onSave: ScanType[];
    /** Glob patterns (scanner syntax, `**` at any depth) added to the scanner's default excludes. */
    excludes: string[];
    /** Extra `xygeni scan` options in canonical form (`--name=value` / `--name`), only the ones in SCAN_OPTIONS. */
    options: string[];
}

export function defaultScanConfig(): ScanConfig {
    return { scans: [...DEFAULT_FULL_SCAN_TYPES], onSave: [...DEFAULT_ON_SAVE_SCAN_TYPES], excludes: [], options: [] };
}

export function isDefaultScanConfig(config: ScanConfig): boolean {
    const defaults = defaultScanConfig();
    return sameSet(config.scans, defaults.scans) && sameSet(config.onSave, defaults.onSave) && config.excludes.length === 0
        && config.options.length === 0;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every(value => b.includes(value));
}

function isScanType(value: unknown): value is ScanType {
    return typeof value === 'string' && (ALL_SCAN_TYPES as readonly string[]).includes(value);
}

/**
 * Makes a configuration consistent, whatever it was read from: unknown types dropped, CLI order kept, a scanner
 * that runs with another follows it, on-save limited to the file-scoped types that are also in the full scan,
 * and an empty full scan falls back to the defaults (the scanner needs at least one type).
 */
export function normalizeScanConfig(input: Partial<ScanConfig> | undefined): ScanConfig {
    const defaults = defaultScanConfig();
    const requested = new Set((Array.isArray(input?.scans) ? input!.scans : defaults.scans).filter(isScanType));
    for (const scanner of SCANNERS) {
        if (scanner.runsWith) {
            if (requested.has(scanner.runsWith)) { requested.add(scanner.key); } else { requested.delete(scanner.key); }
        }
    }
    const scans = ALL_SCAN_TYPES.filter(type => requested.has(type));
    const effectiveScans = scans.length > 0 ? scans : defaults.scans;

    const requestedOnSave = new Set((Array.isArray(input?.onSave) ? input!.onSave : defaults.onSave).filter(isScanType));
    const onSaveTypes = ON_SAVE_SCANNERS.map(scanner => scanner.key);
    const onSave = ALL_SCAN_TYPES
        .filter(type => requestedOnSave.has(type) && onSaveTypes.includes(type) && effectiveScans.includes(type));

    const excludes = Array.isArray(input?.excludes)
        // A quote or control character could end the argument on Windows (see hasUnsafeChars): dropped.
        ? Array.from(new Set(input!.excludes.filter((value): value is string => typeof value === 'string').map(value => value.trim())
            .filter(value => value.length > 0 && !hasUnsafeChars(value))))
        : [];
    const options = normalizeScanOptions(input?.options);
    return { scans: effectiveScans, onSave, excludes, options };
}

/** Parses the file content; invalid JSON or a non-object gives the defaults. */
export function parseScanConfig(content: string | undefined): ScanConfig {
    if (!content) { return defaultScanConfig(); }
    try {
        const parsed = JSON.parse(content);
        return normalizeScanConfig(parsed && typeof parsed === 'object' ? parsed : undefined);
    } catch {
        return defaultScanConfig();
    }
}

/** The keys this version reads and writes; any other key in the file is kept as it is. */
export const SCAN_CONFIG_KNOWN_KEYS = ['scans', 'onSave', 'excludes', 'options'];

/**
 * The file content. The file is shared by the four plugins and committed: the keys of `existing` this version does
 * not know (added by another plugin or a later version) are kept, only the four known ones are replaced.
 */
export function serializeScanConfig(config: ScanConfig, existing?: string): string {
    let others: Record<string, unknown> = {};
    try {
        const parsed: unknown = existing ? JSON.parse(existing) : undefined;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            others = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([key]) => !SCAN_CONFIG_KNOWN_KEYS.includes(key)));
        }
    } catch {
        // Not JSON: rewritten with the known keys only, as before.
    }
    return JSON.stringify({ scans: config.scans, onSave: config.onSave, excludes: config.excludes, options: config.options, ...others }, null, 2) + '\n';
}

export function scanConfigPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, SCAN_CONFIG_DIR, SCAN_CONFIG_FILE);
}

/** The configuration of a workspace: the file when it exists, the defaults otherwise. */
export function loadScanConfig(workspaceRoot: string | undefined): ScanConfig {
    if (!workspaceRoot) { return defaultScanConfig(); }
    const filePath = scanConfigPath(workspaceRoot);
    try {
        return parseScanConfig(fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined);
    } catch {
        return defaultScanConfig();
    }
}

/**
 * Refuses to write through a link: a repository can commit `.xygeni` or `ide.json` as a symbolic link, and a switch
 * in the IDE would then overwrite the file it points to (`~/.bashrc`…), outside the project.
 */
export function assertScanConfigNotLinked(filePath: string): void {
    for (const candidate of [path.dirname(filePath), filePath]) {
        if (fs.lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink()) {
            throw new Error(`${candidate} is a symbolic link: not written, so a change cannot land outside the project`);
        }
    }
}

/**
 * Writes the configuration, keeping the keys of the file this version does not know. The defaults do not create the
 * file (an untouched project leaves nothing behind), but an existing one is rewritten, never deleted: it is usually
 * committed, and "Restore defaults" must not show up as a deleted file.
 */
export function saveScanConfig(workspaceRoot: string, config: ScanConfig): void {
    const filePath = scanConfigPath(workspaceRoot);
    assertScanConfigNotLinked(filePath);
    const normalized = normalizeScanConfig(config);
    const exists = fs.existsSync(filePath);
    if (isDefaultScanConfig(normalized) && !exists) { return; }
    const existing = exists ? fs.readFileSync(filePath, 'utf8') : undefined;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeScanConfig(normalized, existing));
}

/** A copy with `type` switched in or out of the full scan; on-save follows (it can never exceed the full scan). */
export function withScanType(config: ScanConfig, type: ScanType, enabled: boolean): ScanConfig {
    const scans = enabled ? [...config.scans, type] : config.scans.filter(value => value !== type);
    return normalizeScanConfig({ ...config, scans });
}

/** A copy with `type` switched in or out of the on-save scan. */
export function withOnSaveType(config: ScanConfig, type: ScanType, enabled: boolean): ScanConfig {
    const onSave = enabled ? [...config.onSave, type] : config.onSave.filter(value => value !== type);
    return normalizeScanConfig({ ...config, onSave });
}

/** The default on-save types (within the full scan): what Auto Scan on Save runs when nothing was chosen. */
export function withDefaultOnSave(config: ScanConfig): ScanConfig {
    return normalizeScanConfig({ ...config, onSave: [...DEFAULT_ON_SAVE_SCAN_TYPES] });
}

export function withAllScanTypes(config: ScanConfig, enabled: boolean): ScanConfig {
    return normalizeScanConfig({ ...config, scans: enabled ? [...ALL_SCAN_TYPES] : [] });
}

export function withExclude(config: ScanConfig, pattern: string): ScanConfig {
    return normalizeScanConfig({ ...config, excludes: [...config.excludes, pattern] });
}

export function withoutExclude(config: ScanConfig, pattern: string): ScanConfig {
    return normalizeScanConfig({ ...config, excludes: config.excludes.filter(value => value !== pattern) });
}

/** Adds (or replaces, same option) one canonical scan option. */
export function withScanOption(config: ScanConfig, option: string): ScanConfig {
    const name = scanOptionName(option);
    return normalizeScanConfig({ ...config, options: [...config.options.filter((entry) => scanOptionName(entry) !== name), option] });
}

/** Removes the option with that name (`--ai-review`), whatever its value. */
export function withoutScanOption(config: ScanConfig, name: string): ScanConfig {
    return normalizeScanConfig({ ...config, options: config.options.filter((entry) => scanOptionName(entry) !== name) });
}

/**
 * The exclude pattern of a folder inside the workspace: its path relative to the root, forward slashes, plus
 * `/**` (everything under it). Undefined for the root itself or a folder outside it.
 */
export function excludePatternForFolder(workspaceRoot: string, folder: string): string | undefined {
    const relative = path.relative(workspaceRoot, folder);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return undefined;
    }
    return relative.split(path.sep).join('/') + '/**';
}

/**
 * The `--exclude-add=<patterns>` argument, or undefined without excludes. `--exclude-add` keeps the scanner's
 * default excludes (node_modules, target, dist…); `-e/--exclude` would replace them (scanner 6.23+, #2324).
 */
export function excludeAddArgument(config: ScanConfig): string | undefined {
    return config.excludes.length > 0 ? `--exclude-add=${config.excludes.join(',')}` : undefined;
}
