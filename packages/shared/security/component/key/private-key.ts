// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createPrivateKey} from 'node:crypto';

export class PrivateKey {

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): PrivateKey {
        PrivateKey.assertPrivateKey(value);

        return new PrivateKey(value);
    }

    private static assertPrivateKey(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('Private key buffer cannot be empty.');
        }

        try {
            createPrivateKey(value);
        } catch {
            throw new Error('Invalid private key buffer. Expected a valid private key.');
        }
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
