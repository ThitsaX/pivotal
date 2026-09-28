// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Derives the `FSPIOP-URI` value that goes into the JWS protected header.
 *
 * `FSPIOP-URI` is the *resource path*, not the request URL: scheme, host, port and any base-path
 * prefix are stripped, so the value is stable no matter how the peer's base URL is configured.
 *
 *     https://hub.example.com/quotes/abc-123        ->  /quotes/abc-123
 *     http://moja-quoting-service.mojaloop/quotes/1 ->  /quotes/1
 *
 * The value is anchored on a known FSPIOP resource name because that is how the receiving
 * validator derives it. Sender and verifier must agree exactly or the signature check fails.
 *
 * An unrecognised path **throws**. It is never degraded to the raw path: a degraded value is
 * signed and sent successfully today — no peer verifies yet — and surfaces months later, in
 * production, as a signature mismatch several layers from its cause. Failing here turns that into
 * a stack trace on the line that built the request.
 */
export class FspiopUri {

    /**
     * Resource names as they appear in the FSPIOP API paths, case-sensitive.
     *
     * Adding an FSPIOP resource to the platform means adding it here, or signing will throw for
     * that path. That is the intended failure mode — see the class comment.
     */
    static readonly RESOURCES: readonly string[] = [
        'participants',
        'parties',
        'quotes',
        'transfers',
        'transactionRequests',
        'authorizations',
        'bulkQuotes',
        'bulkTransfers',
        'fxQuotes',
        'fxTransfers',
        'services',
        'transactions',
    ];

    private static readonly PATTERN = new RegExp(`/(?:${FspiopUri.RESOURCES.join('|')})(?:/|$)`);

    private constructor() {
    }

    /**
     * @param requestUrl a full URL or a path; both are accepted
     * @returns the resource path, always starting with `/` and never carrying a query or fragment
     * @throws if the path contains no known FSPIOP resource name
     */
    static extract(requestUrl: string): string {

        if (requestUrl == null || requestUrl.trim().length === 0) {
            throw new Error('Cannot derive FSPIOP-URI: the request URL is empty.');
        }

        const path = FspiopUri.toPath(requestUrl);
        const match = FspiopUri.PATTERN.exec(path);

        if (match == null) {
            throw new Error(
                `Cannot derive FSPIOP-URI from '${requestUrl}': the path contains no known FSPIOP `
                + `resource name. Known resources: ${FspiopUri.RESOURCES.join(', ')}. `
                + 'Add the resource to FspiopUri.RESOURCES if this path is legitimate.',
            );
        }

        return path.substring(match.index);
    }

    /**
     * Strips scheme, authority, query and fragment, leaving a path that always starts with `/`.
     * Works for both absolute URLs and bare paths, without depending on a base URL being present.
     */
    private static toPath(requestUrl: string): string {

        const withoutFragment = requestUrl.split('#')[0];
        const withoutQuery = withoutFragment.split('?')[0];

        const schemeSeparator = withoutQuery.indexOf('://');

        if (schemeSeparator < 0) {
            return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
        }

        const afterScheme = withoutQuery.substring(schemeSeparator + '://'.length);
        const pathStart = afterScheme.indexOf('/');

        return pathStart < 0 ? '/' : afterScheme.substring(pathStart);
    }
}
