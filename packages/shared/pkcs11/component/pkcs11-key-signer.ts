// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import * as pkcs11js from 'pkcs11js';
import {Pkcs11SessionPool} from './pkcs11-session-pool';

/**
 * Signs bytes with a key held inside the device, named by its label.
 *
 * The label **is** the `keyRef` the rest of the system carries. It is opaque above this class and
 * version-inclusive by design: rotation always mints a new label, so a cached handle can never
 * outlive the key it points at.
 */
export class Pkcs11KeySigner {

    /** RSA-2048 signatures are 256 bytes; the device writes the length it actually used. */
    private static readonly SIGNATURE_BUFFER_BYTES = 256;

    private readonly logger = new Logger(Pkcs11KeySigner.name);

    /**
     * Resolved key handles, by label.
     *
     * Cached because `C_FindObjects` is a device round trip, and running one per signature would
     * double the calls on the busiest path in the system. Safe to cache precisely because a label
     * identifies one immutable key: the value behind it never changes, so the entry can only ever
     * be stale in the sense of pointing at a key nobody uses any more.
     */
    private readonly handles = new Map<string, Buffer>();

    constructor(private readonly pool: Pkcs11SessionPool) {
    }

    /**
     * @param label the key's PKCS#11 label — the `keyRef`
     * @param bytes the signing input, already assembled by the caller
     * @returns the raw signature
     */
    async sign(label: string, bytes: Buffer): Promise<Buffer> {

        return this.pool.withSession(async (pkcs11, session) => {

            const key = this.resolve(pkcs11, session, label);

            // CKM_SHA256_RSA_PKCS hashes inside the device, so the whole signing input goes in
            // and a PKCS#1 v1.5 signature comes back -- the same construction the in-process path
            // produces with RSA-SHA256, which is what lets a peer verify either one.
            pkcs11.C_SignInit(session, {mechanism: pkcs11js.CKM_SHA256_RSA_PKCS}, key);

            // The async form, not C_Sign. The synchronous call blocks the event loop for the whole
            // device round trip -- measured at every heartbeat missed during a run of them -- and
            // on a path signing several times per transfer that stalls the process rather than
            // slowing it.
            return pkcs11.C_SignAsync(
                session,
                bytes,
                Buffer.alloc(Pkcs11KeySigner.SIGNATURE_BUFFER_BYTES),
            );
        });
    }

    /** Forgets a cached handle. For a key destroyed or rotated while the process is running. */
    forget(label: string): void {
        this.handles.delete(label);
    }

    private resolve(pkcs11: pkcs11js.PKCS11, session: Buffer, label: string): Buffer {

        const cached = this.handles.get(label);

        if (cached != null) {
            return cached;
        }

        pkcs11.C_FindObjectsInit(session, [
            {type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY},
            {type: pkcs11js.CKA_LABEL, value: label},
        ]);

        try {
            // Two asked for, one expected. A label matching two keys is ambiguous rather than
            // convenient: the device would answer with whichever it found first, so a signature
            // could be made with a key the peers were never told about.
            const found = pkcs11.C_FindObjects(session, 2);

            if (found.length === 0) {
                throw new Error(
                    `No private key labelled '${label}' on this token. Either the key reference is `
                    + 'stale, or this crypto user cannot see the key.',
                );
            }

            if (found.length > 1) {
                throw new Error(
                    `More than one private key is labelled '${label}'. A label must identify one `
                    + 'key; signing would otherwise use an arbitrary one of them.',
                );
            }

            this.handles.set(label, found[0]);

            return found[0];

        } finally {
            pkcs11.C_FindObjectsFinal(session);
        }
    }
}
