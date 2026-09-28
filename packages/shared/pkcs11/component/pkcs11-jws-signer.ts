// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {FspiopProtectedHeader, FspiopSignature, JwsSigner} from '@shared/fspiop';
import {Pkcs11KeySigner} from './pkcs11-key-signer';

/**
 * Answers which key reference a tenant signs with.
 *
 * Separate from the signer because the answer comes from Vault, and **Vault must not be on the
 * signing path**: it is read at startup and on a rotation nudge, so that an outage in Vault cannot
 * become an outage in payments. An implementation of this serves from what it already holds.
 */
export abstract class KeyRefSource {

    /** @returns the key reference for `fspId`, or `undefined` when this deployment holds none. */
    abstract keyRefFor(fspId: string): string | undefined;
}

/**
 * Signs FSPIOP requests inside a PKCS#11 device — the **HSM-backed** profile.
 *
 * No private key is present in this process, so unlike the in-process signer there is nothing here
 * to leak, and nothing that a heap dump or a compromised pod would yield. What the process holds is
 * a crypto-user credential and a key reference: enough to *ask* the device to sign while the
 * credential lasts, never enough to sign without it.
 */
export class Pkcs11JwsSigner extends JwsSigner {

    private readonly logger = new Logger(Pkcs11JwsSigner.name);

    constructor(
        private readonly keySigner: Pkcs11KeySigner,
        private readonly keyRefs: KeyRefSource,
    ) {
        super();
    }

    async sign(
        fspId: string,
        input: FspiopProtectedHeader.Input,
        payload: string,
    ): Promise<FspiopSignature.Header | undefined> {

        const keyRef = this.keyRefs.keyRefFor(fspId);

        if (keyRef == null) {
            return undefined;
        }

        // Built by the same code the in-process path uses, deliberately. Assembling the signing
        // input separately here would be the one defect no local test can catch: a round trip
        // within this deployment would share the mistake and pass, and only a peer would reject.
        const {protectedHeader, bytes} = FspiopSignature.signingInput(input, payload);

        const signature = await this.keySigner.sign(keyRef, Buffer.from(bytes, 'utf-8'));

        return {
            // base64url, matching what the in-process signer asks Node for, and what RFC 7515
            // requires. Plain base64 here would be rejected by every peer.
            signature: signature.toString('base64url'),
            protectedHeader,
        };
    }
}
