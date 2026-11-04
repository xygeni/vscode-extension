/**
 * Version strings of the Xygeni MCP server (xygeni/xygeni-product-backlog#2382).
 *
 * The published `version.txt` holds the JAR version on a single line (`1.2.2`, no `v` prefix); the installed
 * one is kept in `~/.xygeni/mcp/version.txt`. A missing or unparseable installed version counts as outdated,
 * so a JAR installed before the version file existed is updated once.
 */

const VERSION_PATTERN = /^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/;
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;

/** What an update check found. */
export interface McpUpdateCheck {
    installed?: string;
    available: string;
    updateAvailable: boolean;
}

/** `1.2.3` -> [1, 2, 3]. A `v` prefix and a `-SNAPSHOT` / `+build` suffix are ignored. Undefined when not a version. */
export function parseVersion(raw?: string): number[] | undefined {
    const match = VERSION_PATTERN.exec((raw ?? '').trim());
    if (!match) {
        return undefined;
    }
    return match[1].split('.').map(segment => parseInt(segment, 10));
}

/** Numeric, segment by segment; a missing segment counts as 0 (`1.2` == `1.2.0`). Unparseable sorts first. */
export function compareVersions(a?: string, b?: string): number {
    const left = parseVersion(a);
    const right = parseVersion(b);
    if (!left || !right) {
        return (left ? 1 : 0) - (right ? 1 : 0);
    }
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) {
        const diff = (left[i] ?? 0) - (right[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/** True when `remote` is a version newer than `local`; an unknown or invalid `local` is always outdated. */
export function isNewerVersion(remote?: string, local?: string): boolean {
    if (!parseVersion(remote)) {
        return false;
    }
    if (!parseVersion(local)) {
        return true;
    }
    return compareVersions(remote, local) > 0;
}

/** The version in a `version.txt` body: first non-blank line, trimmed, without the `v` prefix. Undefined when invalid. */
export function versionFromFile(content?: string): string | undefined {
    const line = (content ?? '').split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0);
    if (!line || !parseVersion(line)) {
        return undefined;
    }
    return line.replace(/^v/, '');
}

/** The hash in a `sha256sum`-style body (`<hash>  xygeni-mcp-server.jar`), lowercase. Undefined when it is not one. */
export function checksumFromFile(content?: string): string | undefined {
    const token = (content ?? '').trim().split(/\s+/)[0];
    return SHA256_PATTERN.test(token) ? token.toLowerCase() : undefined;
}
