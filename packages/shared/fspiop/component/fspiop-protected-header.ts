// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { FspiopUri } from './fspiop-uri';

/**
 * Builds the FSPIOP JWS protected header.
 *
 * The header binds request *metadata* into the signature, so a validly-signed body cannot be
 * replayed against a different endpoint, method or destination.
 *
 * The contract is three mandatory fields, two conditional, and **nothing else** — no `typ`, no
 * `cty`, no HTTP headers beyond those named. Property names are **case-sensitive** here even
 * though HTTP header names are not, which is the single most common way to get this wrong.
 *
 *     { "alg", "FSPIOP-URI", "FSPIOP-HTTP-Method", "FSPIOP-Source"[, "FSPIOP-Destination"][, "Date"] }
 *
 * Field order is preserved deliberately. The signature covers the serialized header bytes, so a
 * reordered header is a different signing input.
 */
export class FspiopProtectedHeader {

    static readonly DEFAULT_ALGORITHM = 'RS256';

    private constructor() {
    }

    static build(input: FspiopProtectedHeader.Input): FspiopProtectedHeader.Fields {

        if (input.source == null || input.source.trim().length === 0) {
            throw new Error('Cannot build the FSPIOP protected header: fspiop-source is required.');
        }

        if (input.method == null || input.method.trim().length === 0) {
            throw new Error('Cannot build the FSPIOP protected header: the HTTP method is required.');
        }

        // Insertion order is the serialization order, and the serialization is what gets signed.
        const fields: FspiopProtectedHeader.Fields = {
            alg: input.alg ?? FspiopProtectedHeader.DEFAULT_ALGORITHM,
            'FSPIOP-URI': FspiopUri.extract(input.uri),
            'FSPIOP-HTTP-Method': input.method.toUpperCase(),
            'FSPIOP-Source': input.source,
        };

        if (FspiopProtectedHeader.isPresent(input.destination)) {
            fields['FSPIOP-Destination'] = String(input.destination);
        }

        if (FspiopProtectedHeader.isPresent(input.date)) {
            fields.Date = String(input.date);
        }

        return fields;
    }

    static serialize(input: FspiopProtectedHeader.Input): string {
        return JSON.stringify(FspiopProtectedHeader.build(input));
    }

    private static isPresent(value: string | null | undefined): boolean {
        return value != null && String(value).trim().length > 0;
    }
}

export namespace FspiopProtectedHeader {

    export interface Input {

        /** HTTP method of the request being signed; upper-cased into the header. */
        method: string;

        /** Request URL or path. Reduced to the resource path by {@link FspiopUri.extract}. */
        uri: string;

        /** Value of the `fspiop-source` HTTP header. */
        source: string;

        /** Value of the `fspiop-destination` HTTP header, when the request carries one. */
        destination?: string | null;

        /** Value of the `date` HTTP header, when the request carries one. */
        date?: string | null;

        /** Signing algorithm. Defaults to RS256 — settled decision 3. */
        alg?: string;
    }

    export interface Fields extends Record<string, string> {
        alg: string;
        'FSPIOP-URI': string;
        'FSPIOP-HTTP-Method': string;
        'FSPIOP-Source': string;
    }
}
