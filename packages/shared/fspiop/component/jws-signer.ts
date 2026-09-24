// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PrivateKeyStore} from '@shared/security/component/key';
import {FspiopProtectedHeader} from './fspiop-protected-header';
import {FspiopSignature} from './fspiop-signature';

/**
 * Produces the `fspiop-signature` header for a tenant Pivotal signs as.
 *
 * Exists because custody decides *where* signing happens, not just where the key is kept. Where the
 * key is a PEM the process can hold, signing is a local computation over key material. Where the
 * key is inside a hardware module it is a request to that device, and **no key material is ever
 * available to sign with** — so a contract that hands back a private key cannot be implemented
 * there at all. This one hands back a signature instead, which both custody models can produce.
 *
 * That is also why it is asynchronous. In-process signing has no need to be, but a device call is a
 * round trip, and a synchronous binding would block the event loop for its whole duration — on a
 * path that signs several times per transfer.
 *
 * **Unkeyed tenants return `undefined` rather than throwing.** A participant is switched on by
 * being given a key, not by a deploy, so a request for a tenant with no key must pass through
 * unsigned exactly as it does today.
 */
export abstract class JwsSigner {

    /**
     * @param fspId the `fspiop-source` this request is signed as
     * @param input request metadata bound into the protected header
     * @param payload the request body, as the JSON text that will be sent on the wire
     * @returns the header pair, or `undefined` when this deployment holds no key for `fspId`
     */
    abstract sign(
        fspId: string,
        input: FspiopProtectedHeader.Input,
        payload: string,
    ): Promise<FspiopSignature.Header | undefined>;
}

/**
 * Signs in this process, from key material held in memory.
 *
 * Serves every profile whose custody yields a private key the process can read — `vault-kv`, and
 * the legacy `database` path behind it. The key reaches the store before this is called: Vault is
 * read at startup and cached, never on the signing path, so that an outage in Vault cannot become
 * an outage in payments.
 */
export class PrivateKeyJwsSigner extends JwsSigner {

    constructor(private readonly privateKeyStore: PrivateKeyStore) {
        super();
    }

    async sign(
        fspId: string,
        input: FspiopProtectedHeader.Input,
        payload: string,
    ): Promise<FspiopSignature.Header | undefined> {

        const privateKey = this.privateKeyStore.get(fspId);

        if (privateKey == null) {
            return undefined;
        }

        // Deliberately the same call the conformance vectors pin. Custody changes who holds the
        // key, never what gets signed -- the two profiles must produce a byte-identical signing
        // input, or a signature made under one is rejected by a peer verifying against the other.
        return FspiopSignature.sign(privateKey, input, payload);
    }
}
