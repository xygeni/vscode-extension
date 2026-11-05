/**
 * Plain-http server URLs (xygeni/xygeni-product-backlog#1438). The extension sends the API token as a bearer header on
 * every request, so over `http://` it travels in clear. Rule shared by the four Xygeni IDE plugins:
 *
 * - `https://` is the normal case.
 * - `http://` to a loopback host (localhost, 127.0.0.1, ::1) is allowed silently: the traffic never leaves the machine.
 * - `http://` to any other host is refused unless the user opts in with "Allow insecure HTTP", and then the connection
 *   status keeps warning that the token travels in clear.
 */

export const ALLOW_INSECURE_HTTP_SETTING = 'allowInsecureHttp';

/** The warning shown next to the connection status while an insecure URL is allowed. */
export const INSECURE_HTTP_WARNING = 'Insecure http URL: the API token travels in clear';

/** The reason an insecure URL is refused, for the error message and the status line. */
export const INSECURE_HTTP_REFUSED = 'Insecure URL: the server URL uses http and the API token would travel in clear. '
    + 'Use https, or enable "Allow insecure HTTP" in the Xygeni settings if this server really has no TLS.';

export function isLoopbackHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
    // The whole 127/8 block, as an address: a DNS name such as 127.example.com is not loopback.
    return host === 'localhost' || host.endsWith('.localhost') || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
        || host === '::1' || host === '0:0:0:0:0:0:0:1';
}

/** True for an `http://` URL whose host is not loopback: the token would leave the machine in clear. */
export function isInsecureRemoteUrl(url: string | undefined): boolean {
    if (!url) { return false; }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname);
    } catch {
        return false;
    }
}

/** Why the URL cannot be used, or undefined when it can (https, loopback, or insecure but allowed). */
export function insecureUrlProblem(url: string | undefined, allowInsecureHttp: boolean): string | undefined {
    return isInsecureRemoteUrl(url) && !allowInsecureHttp ? INSECURE_HTTP_REFUSED : undefined;
}
