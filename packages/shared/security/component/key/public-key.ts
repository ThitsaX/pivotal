// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createPrivateKey, createPublicKey} from 'node:crypto';

export class PublicKey {

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): PublicKey {
        PublicKey.assertPublicKey(value);

        return new PublicKey(value);
    }

    private static assertPublicKey(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('Public key buffer cannot be empty.');
        }

        try {
            createPublicKey(value);
        } catch {
            throw new Error('Invalid public key buffer. Expected a valid public key.');
        }

        let isPrivateKey = false;

        try {
            createPrivateKey(value);
            isPrivateKey = true;
        } catch {
            isPrivateKey = false;
        }

        if (isPrivateKey) {
            throw new Error('Invalid public key buffer. Expected a valid public key.');
        }
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
