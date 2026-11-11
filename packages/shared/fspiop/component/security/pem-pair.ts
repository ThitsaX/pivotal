// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs';

export interface PemPair {
    cert: string;
    key: string;
}

export interface PemPairEnvNames {
    certPath: string;
    keyPath: string;
    cert: string;
    key: string;
}

/**
 * Reads a certificate and its private key from either mounted files or inline values.
 *
 * Files take precedence. A deployment mounts a Secret that is renewed on its own
 * cadence, so the material has to be read from disk rather than baked into the
 * Deployment; the inline form remains for local runs.
 *
 * Certificate and key are always required together. Half a pair is a misconfiguration
 * that would otherwise surface as an opaque handshake failure far from its cause.
 *
 * Shared by the client-side and server-side stores so the two cannot drift: they read
 * different variables, but what counts as configured must mean the same thing for both.
 *
 * Returns null when neither source is configured.
 */
export function readPemPair(names: PemPairEnvNames): PemPair | null {
    const certPath = process.env[names.certPath];
    const keyPath = process.env[names.keyPath];
    const hasCertPath = certPath != null && certPath.trim().length > 0;
    const hasKeyPath = keyPath != null && keyPath.trim().length > 0;

    if (hasCertPath || hasKeyPath) {
        if (!hasCertPath || !hasKeyPath) {
            throw new Error(`${names.certPath} and ${names.keyPath} must be set together.`);
        }

        return {
            cert: fs.readFileSync(certPath!.trim(), 'utf-8'),
            key: fs.readFileSync(keyPath!.trim(), 'utf-8'),
        };
    }

    const cert = process.env[names.cert];
    const key = process.env[names.key];
    const hasCert = cert != null && cert.trim().length > 0;
    const hasKey = key != null && key.trim().length > 0;

    if (!hasCert && !hasKey) {
        return null;
    }

    if (!hasCert || !hasKey) {
        throw new Error(`${names.cert} and ${names.key} must be set together.`);
    }

    return {
        cert: cert!.replace(/\\n/g, '\n'),
        key: key!.replace(/\\n/g, '\n'),
    };
}
