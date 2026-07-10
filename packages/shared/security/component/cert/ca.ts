// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {X509Certificate} from 'node:crypto';

export class Ca {

    private static readonly PEM_CERT_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): Ca {
        Ca.assertCaBundle(value);

        return new Ca(value);
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }

    private static assertCaBundle(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('CA buffer cannot be empty.');
        }

        // A single DER/PEM certificate may parse directly.
        try {
            new X509Certificate(value);
            return;
        } catch {
            // Fall through and validate PEM bundle content.
        }

        const pemBundle = value.toString('utf-8');
        const certMatches = pemBundle.match(Ca.PEM_CERT_PATTERN);

        if (certMatches == null || certMatches.length === 0) {
            throw new Error('Invalid CA buffer. Expected one or more valid X.509 certificates.');
        }

        const remainder = pemBundle.replace(Ca.PEM_CERT_PATTERN, '').trim();
        if (remainder.length > 0) {
            throw new Error('Invalid CA buffer. Expected only X.509 certificate PEM content.');
        }

        try {
            for (const certPem of certMatches) {
                new X509Certificate(certPem);
            }
        } catch {
            throw new Error('Invalid CA buffer. Expected one or more valid X.509 certificates.');
        }
    }
}
