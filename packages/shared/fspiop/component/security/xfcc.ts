// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Reads the client-certificate details a terminating proxy forwards.
 *
 * When Envoy terminates mutual TLS it opens a fresh plain connection upstream, so the certificate
 * never reaches this process. What arrives instead is `x-forwarded-client-cert`, describing the
 * certificate the proxy verified.
 *
 * **This header is only meaningful when the proxy is configured to overwrite it.** Under Envoy's
 * forwarding modes a caller can set it themselves, and nothing here could tell the difference —
 * the value looks identical. The gateway must run `SANITIZE_SET`, and this parser assumes it does.
 * That assumption is the reason the deployment states the mode explicitly rather than inheriting it.
 */
export class Xfcc {

    static readonly HEADER_NAME = 'x-forwarded-client-cert';

    private constructor(
        /** SHA-256 of the certificate's DER, lower-case hex. The lookup key. */
        readonly hash: string,
        /** Subject DN, when the gateway is configured to include it. Diagnostics only. */
        readonly subject: string | undefined,
        /** Identity of the proxy that did the verifying. Diagnostics only. */
        readonly by: string | undefined,
    ) {
    }

    /**
     * Parses the header, returning null when it carries no usable identity.
     *
     * Envoy separates entries with `,` and pairs within an entry with `;`. Only the **first**
     * entry is read: under `SANITIZE_SET` there is exactly one, and if more appear the proxy is
     * appending rather than replacing — in which case later entries may be a caller's own and
     * must not be trusted. Taking the first is both correct under the required mode and the safe
     * reading under a misconfigured one.
     *
     * Values may be double-quoted, which is how a subject containing commas or semicolons is
     * carried; quotes are stripped and escaped quotes honoured.
     */
    static parse(header: string | undefined): Xfcc | null {

        if (header == null) {
            return null;
        }

        const firstEntry = Xfcc.firstEntry(header);

        if (firstEntry.length === 0) {
            return null;
        }

        const pairs = Xfcc.splitPairs(firstEntry);
        const hash = pairs.get('hash');

        // Without a hash there is nothing to resolve. Envoy always includes it when it sets the
        // header, so its absence means this did not come from a terminating proxy.
        if (hash == null || !/^[0-9a-f]{64}$/i.test(hash)) {
            return null;
        }

        return new Xfcc(hash.toLowerCase(), pairs.get('subject'), pairs.get('by'));
    }

    /** Splits on the first unquoted comma. */
    private static firstEntry(header: string): string {

        let quoted = false;

        for (let index = 0; index < header.length; index++) {
            const character = header[index];

            if (character === '"' && header[index - 1] !== '\\') {
                quoted = !quoted;
            } else if (character === ',' && !quoted) {
                return header.slice(0, index).trim();
            }
        }

        return header.trim();
    }

    /** Keys are matched case-insensitively; Envoy's casing is not contractual. */
    private static splitPairs(entry: string): Map<string, string> {

        const pairs = new Map<string, string>();

        let quoted = false;
        let start = 0;

        const take = (segment: string): void => {
            const separator = segment.indexOf('=');

            if (separator <= 0) {
                return;
            }

            const key = segment.slice(0, separator).trim().toLowerCase();
            const value = Xfcc.unquote(segment.slice(separator + 1).trim());

            // First occurrence wins, matching the first-entry rule above.
            if (value.length > 0 && !pairs.has(key)) {
                pairs.set(key, value);
            }
        };

        for (let index = 0; index < entry.length; index++) {
            const character = entry[index];

            if (character === '"' && entry[index - 1] !== '\\') {
                quoted = !quoted;
            } else if (character === ';' && !quoted) {
                take(entry.slice(start, index));
                start = index + 1;
            }
        }

        take(entry.slice(start));

        return pairs;
    }

    private static unquote(value: string): string {

        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1).replace(/\\"/g, '"');
        }

        return value;
    }
}
