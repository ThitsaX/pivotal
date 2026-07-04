// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import * as JsonWebToken from 'jsonwebtoken';
import {PrivateKey} from '../key/private-key';
import {PublicKey} from '../key/public-key';

export class Jwt {

    private static readonly INVALID_JSON_PAYLOAD_ERROR = 'JWT payload must be a valid JSON object.';

    private constructor() {
    }

    static decode(base64Url: string): string {
        return Buffer.from(base64Url, 'base64url').toString('utf-8');
    }

    static encode(json: string): string {
        return Buffer.from(json, 'utf-8').toString('base64url');
    }

    static sign(
        privateKey: PrivateKey,
        headers: Record<string, string>,
        payload: Record<string, unknown>,
    ): Jwt.Token;
    static sign(
        privateKey: PrivateKey,
        algorithm: JsonWebToken.Algorithm,
        headers: Record<string, string>,
        payload: Record<string, unknown>,
    ): Jwt.Token;
    static sign(
        privateKey: PrivateKey,
        algorithmOrHeaders: JsonWebToken.Algorithm | Record<string, string>,
        headersOrPayload: Record<string, string> | Record<string, unknown>,
        payloadArg?: Record<string, unknown>,
    ): Jwt.Token {

        const algorithm = payloadArg == null ? 'RS256' : algorithmOrHeaders as JsonWebToken.Algorithm;

        const headers = payloadArg == null
            ? algorithmOrHeaders as Record<string, string>
            : headersOrPayload as Record<string, string>;

        const payload = payloadArg == null
            ? headersOrPayload as Record<string, unknown>
            : payloadArg;
        const parsedPayload = Jwt.toJsonPayload(payload);

        const signOptions: JsonWebToken.SignOptions = {
            algorithm,
            noTimestamp: true,
            header: {
                alg: algorithm,
                typ: 'JWT',
                cty: 'json',
                ...headers,
            },
        };

        const token = JsonWebToken.sign(parsedPayload, Jwt.toSecret(privateKey), signOptions);

        const parts = token.split('.');

        if (parts.length !== 3) {
            throw new Error('JWT signing failed to produce 3 token parts.');
        }

        return new Jwt.Token(parts[0], parts[1], parts[2]);
    }

    static verify(privateKey: PrivateKey, token: string, payload: Record<string, unknown>): boolean;
    static verify(publicKey: PublicKey, token: Jwt.Token): boolean;
    static verify(
        key: PrivateKey | PublicKey,
        tokenOrTokenObject: string | Jwt.Token,
        payload?: Record<string, unknown>,
    ): boolean {

        try {

            if (typeof tokenOrTokenObject === 'string') {
                if (payload == null) {
                    return false;
                }

                const parsedPayload = Jwt.toJsonPayload(payload);
                const content = JsonWebToken.verify(tokenOrTokenObject, Jwt.toSecret(key), {algorithms: ['RS256']});

                if (!Jwt.isJsonObjectPayload(content)) {
                    return false;
                }

                return Jwt.toCanonicalJson(content) === Jwt.toCanonicalJson(parsedPayload);
            }

            const content = JsonWebToken.verify(tokenOrTokenObject.full, Jwt.toSecret(key), {algorithms: ['RS256']});

            if (!Jwt.isJsonObjectPayload(content)) {
                return false;
            }

            return true;

        } catch {
            return false;
        }
    }

    private static toSecret(key: PrivateKey | PublicKey): JsonWebToken.Secret {
        return key.toBuffer();
    }

    private static toJsonPayload(payload: unknown): Record<string, unknown> {
        if (!Jwt.isJsonObjectPayload(payload)) {
            throw new Error(Jwt.INVALID_JSON_PAYLOAD_ERROR);
        }

        return payload;
    }

    private static isJsonObjectPayload(payload: unknown): payload is Record<string, unknown> {
        return typeof payload === 'object' && payload != null && !Array.isArray(payload);
    }

    private static toCanonicalJson(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((item) => Jwt.toCanonicalJson(item)).join(',')}]`;
        }

        if (typeof value === 'object' && value != null) {
            const entries = Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => `${JSON.stringify(key)}:${Jwt.toCanonicalJson(item)}`);

            return `{${entries.join(',')}}`;
        }

        return JSON.stringify(value);
    }
}

export namespace Jwt {

    export class Token {

        readonly header: string;

        readonly body: string;

        readonly signature: string;

        readonly full: string;

        constructor(header: string, body: string, signature: string) {
            if (header == null || body == null || signature == null) {
                throw new Error('JWT token parts cannot be null.');
            }

            this.header = header;
            this.body = body;
            this.signature = signature;
            this.full = `${header}.${body}.${signature}`;
        }
    }
}
