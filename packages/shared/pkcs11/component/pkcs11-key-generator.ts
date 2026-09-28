// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createPublicKey} from 'node:crypto';
import {Logger} from '@nestjs/common';
import * as pkcs11js from 'pkcs11js';
import {Pkcs11SessionPool} from './pkcs11-session-pool';

/**
 * Creates a signing keypair inside the device, owned by the tenant it belongs to.
 *
 * **Generated as the tenant's own crypto user, never as a service identity.** The device confers
 * ownership at creation and has no transfer operation, and an owner keeps the right to use a key
 * forever — so whoever generates it can always sign with it. Generating as the tenant is therefore
 * the only arrangement in which per-tenant isolation actually holds, and a key created under the
 * wrong user cannot be fixed afterwards: it has to be destroyed and remade.
 *
 * Only the public half comes back. There is no private half to return — that is the property this
 * profile is bought for.
 *
 * **Sharing the key with another crypto user is not done here.** PKCS#11 has no operation for it;
 * it is a vendor extension, reached through the device's own tooling. So a tenant whose key is
 * generated here can sign for itself, and a service that signs *on its behalf* cannot until the
 * key is shared out of band — see the onboarding runbook. Attempting it through a guessed
 * interface would produce a key that exists and cannot be used, which is worse than a step an
 * operator knows they still have to take.
 */
export class Pkcs11KeyGenerator {

    private static readonly MODULUS_BITS = 2048;

    /** RSA F4. The exponent every FSPIOP peer expects. */
    private static readonly PUBLIC_EXPONENT = Buffer.from([0x01, 0x00, 0x01]);

    private readonly logger = new Logger(Pkcs11KeyGenerator.name);

    constructor(private readonly pool: Pkcs11SessionPool) {
    }

    /**
     * @param credential the tenant's crypto user — created by a custodian, never by this process
     * @param label the key's label, which becomes its `keyRef`; must be version-inclusive
     * @returns the public half, as an SPKI PEM
     */
    async generate(
        credential: Pkcs11SessionPool.Credential,
        label: string,
    ): Promise<string> {

        return this.pool.withTenantLogin(credential, async (pkcs11, session) => {

            this.refuseDuplicateLabel(pkcs11, session, label);

            const {publicKey} = pkcs11.C_GenerateKeyPair(
                session,
                {mechanism: pkcs11js.CKM_RSA_PKCS_KEY_PAIR_GEN},
                [
                    {type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY},
                    {type: pkcs11js.CKA_TOKEN, value: true},
                    {type: pkcs11js.CKA_LABEL, value: `${label}-pub`},
                    {type: pkcs11js.CKA_MODULUS_BITS, value: Pkcs11KeyGenerator.MODULUS_BITS},
                    {type: pkcs11js.CKA_PUBLIC_EXPONENT, value: Pkcs11KeyGenerator.PUBLIC_EXPONENT},
                    {type: pkcs11js.CKA_VERIFY, value: true},
                ],
                [
                    {type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY},
                    {type: pkcs11js.CKA_TOKEN, value: true},
                    {type: pkcs11js.CKA_LABEL, value: label},
                    {type: pkcs11js.CKA_PRIVATE, value: true},
                    {type: pkcs11js.CKA_SIGN, value: true},
                    // The whole point of this profile: the private half cannot be read out, by
                    // this process or by anyone holding its memory.
                    {type: pkcs11js.CKA_EXTRACTABLE, value: false},
                ],
            );

            const publicKeyPem = Pkcs11KeyGenerator.exportPublicKey(pkcs11, session, publicKey);

            this.logger.log(
                `Generated an RSA-${Pkcs11KeyGenerator.MODULUS_BITS} signing key labelled `
                + `'${label}' as `
                + `'${credential.username.length > 0 ? credential.username : '(pin only)'}'.`,
            );

            return publicKeyPem;
        });
    }

    /**
     * Rebuilds the public key as a PEM from what the device will hand over.
     *
     * A device returns an RSA public key as its two numbers rather than as an encoded structure,
     * so the SPKI wrapper is assembled here. The caller publishes this to the registry peers
     * verify against, which is why it has to be a form any verifier reads.
     */
    private static exportPublicKey(
        pkcs11: pkcs11js.PKCS11,
        session: Buffer,
        publicKey: Buffer,
    ): string {

        const [modulus, exponent] = pkcs11.C_GetAttributeValue(session, publicKey, [
            {type: pkcs11js.CKA_MODULUS},
            {type: pkcs11js.CKA_PUBLIC_EXPONENT},
        ]).map(attribute => attribute.value as Buffer);

        return createPublicKey({
            key: {
                kty: 'RSA',
                n: modulus.toString('base64url'),
                e: exponent.toString('base64url'),
            },
            format: 'jwk',
        }).export({type: 'spki', format: 'pem'}) as string;
    }

    /**
     * Refuses to generate over a label that already exists.
     *
     * Two keys with one label is worse than a failure to create one: the lookup then matches
     * ambiguously, and a signature could be made with a key the registry was never told about.
     * Rotation mints a new label every time, so a collision means the caller reused one.
     */
    private refuseDuplicateLabel(
        pkcs11: pkcs11js.PKCS11,
        session: Buffer,
        label: string,
    ): void {

        pkcs11.C_FindObjectsInit(session, [
            {type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY},
            {type: pkcs11js.CKA_LABEL, value: label},
        ]);

        try {
            if (pkcs11.C_FindObjects(session, 1).length > 0) {
                throw new Error(
                    `A private key labelled '${label}' already exists. A label is a key's `
                    + 'reference and must name exactly one key; rotation mints a new label rather '
                    + 'than reusing one.',
                );
            }
        } finally {
            pkcs11.C_FindObjectsFinal(session);
        }
    }
}
