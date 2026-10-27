// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export enum ApiType {
    FSPIOP = 'fspiop',
    ISO20022 = 'iso20022',
}

export namespace ApiType {
    export function parse(value: string | undefined, fallback = ApiType.FSPIOP): ApiType {
        const normalized = value?.trim().toLowerCase();

        if (normalized == null || normalized.length === 0) {
            return fallback;
        }

        if (normalized === ApiType.FSPIOP) {
            return ApiType.FSPIOP;
        }

        if (normalized === ApiType.ISO20022 || normalized === 'iso-20022') {
            return ApiType.ISO20022;
        }

        throw new Error(`Invalid API_TYPE: expected '${ApiType.FSPIOP}' or '${ApiType.ISO20022}'.`);
    }
}
