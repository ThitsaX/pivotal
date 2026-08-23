// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { createSign, createVerify } from 'node:crypto';
import { PrivateKey } from '@shared/security/component/key/private-key';
import { PublicKey } from '@shared/security/component/key/public-key';
import { FspiopProtectedHeader } from './fspiop-protected-header';

/**
 * FSPIOP detached JWS — the `fspiop-signature` header.
 *
 * "Detached" means the payload is not carried in the signature header: the HTTP body *is* the
 * payload. The header transports only `{ signature, protectedHeader }`, and the verifier
 * reconstructs the signing input from the body it received.
 *
 * Signing input, per RFC 7515:
 *
 *     base64url(protectedHeaderJson) + "." + base64url(payloadJson)
 *
 * This deliberately does **not** go through the shared `Jwt` class. `Jwt.sign` injects `typ` and
 * `cty` and splats caller headers into the JOSE header, which is correct for the auth tokens it
 * was built for and wrong for FSPIOP — the protected header contract admits no extra fields.
 * `Jwt` is also used by web-outbound's accessKey guard, so bending it here would reach a leg that
 * has nothing to do with this one.
 *
 * Payload canonicalization matches the reference validator: the body is parsed and re-stringified
 * rather than hashed as received, so both sides derive the same bytes from the same JSON.
 */
export class FspiopSignature {

    private static readonly INVALID_JSON_PAYLOAD_ERROR = 'FSPIOP signature payload must be a valid JSON object.';

    private static readonly SIGNING_ALGORITHMS: Readonly<Record<string, string>> = {
        RS256: 'RSA-SHA256',
    };

    private constructor() {
    }

    /**
     * @param privateKey the signing tenant's key
     * @param input request metadata bound into the protected header
     * @param payload the request body, as the JSON text that will be sent on the wire
     */
    static sign(
        privateKey: PrivateKey,
        input: FspiopProtectedHeader.Input,
        payload: string,
    ): FspiopSignature.Header {

        const fields = FspiopProtectedHeader.build(input);
        const algorithm = FspiopSignature.toNodeAlgorithm(fields.alg);

        const protectedHeader = FspiopSignature.encode(JSON.stringify(fields));
        const encodedPayload = FspiopSignature.encode(FspiopSignature.canonicalize(payload));

        const signature = createSign(algorithm)
            .update(`${protectedHeader}.${encodedPayload}`)
            .sign(privateKey.toBuffer(), 'base64url');

        return { signature, protectedHeader };
    }

    /**
     * Verifies a received `fspiop-signature` against the received body.
     *
     * The protected header is verified **as received**, never rebuilt — rebuilding it would make
     * the signature check tautological. Cross-checking its contents against the actual request is
     * a separate concern and belongs to the caller.
     *
     * @param publicKey the sender's key
     * @param header the parsed `fspiop-signature` header value
     * @param payload the received request body, as JSON text
     */
    static verify(
        publicKey: PublicKey,
        header: FspiopSignature.Header,
        payload: string,
    ): boolean {

        try {
            const fields = FspiopSignature.decodeProtectedHeader(header.protectedHeader);
            const algorithm = FspiopSignature.toNodeAlgorithm(fields.alg);
            const encodedPayload = FspiopSignature.encode(FspiopSignature.canonicalize(payload));

            return createVerify(algorithm)
                .update(`${header.protectedHeader}.${encodedPayload}`)
                .verify(publicKey.toBuffer(), header.signature, 'base64url');

        } catch {
            return false;
        }
    }

    /** Decodes the received protected header so a caller can cross-check its claims. */
    static decodeProtectedHeader(protectedHeader: string): Record<string, string> {

        const decoded = Buffer.from(protectedHeader, 'base64url').toString('utf-8');
        const parsed = JSON.parse(decoded) as unknown;

        if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
            throw new Error('FSPIOP protected header must decode to a JSON object.');
        }

        return parsed as Record<string, string>;
    }

    private static toNodeAlgorithm(alg: string): string {

        const algorithm = FspiopSignature.SIGNING_ALGORITHMS[alg];

        if (algorithm == null) {
            throw new Error(
                `Unsupported FSPIOP signing algorithm '${alg}'. `
                + `Supported: ${Object.keys(FspiopSignature.SIGNING_ALGORITHMS).join(', ')}.`,
            );
        }

        return algorithm;
    }

    /**
     * Parses and re-stringifies the payload, mirroring the reference validator. A body that is not
     * a JSON object cannot be signed — FSPIOP payloads always are.
     */
    private static canonicalize(payload: string): string {

        let parsed: unknown;

        try {
            parsed = JSON.parse(payload);
        } catch {
            throw new Error(FspiopSignature.INVALID_JSON_PAYLOAD_ERROR);
        }

        if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
            throw new Error(FspiopSignature.INVALID_JSON_PAYLOAD_ERROR);
        }

        return JSON.stringify(parsed);
    }

    private static encode(value: string): string {
        return Buffer.from(value, 'utf-8').toString('base64url');
    }
}

export namespace FspiopSignature {

    /** The JSON value carried in the `fspiop-signature` HTTP header. */
    export interface Header {

        /** base64url detached signature. */
        signature: string;

        /** base64url of the serialized protected header. */
        protectedHeader: string;
    }
}
