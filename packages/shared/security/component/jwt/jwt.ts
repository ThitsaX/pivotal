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
        payload: string,
    ): Jwt.Token;
    static sign(
        privateKey: PrivateKey,
        algorithm: JsonWebToken.Algorithm,
        headers: Record<string, string>,
        payload: string,
    ): Jwt.Token;
    static sign(
        privateKey: PrivateKey,
        algorithmOrHeaders: JsonWebToken.Algorithm | Record<string, string>,
        headersOrPayload: Record<string, string> | string,
        payloadArg?: string,
    ): Jwt.Token {

        const algorithm = payloadArg == null ? 'RS256' : algorithmOrHeaders as JsonWebToken.Algorithm;

        const headers = payloadArg == null
            ? algorithmOrHeaders as Record<string, string>
            : headersOrPayload as Record<string, string>;

        const payload = payloadArg == null ? headersOrPayload as string : payloadArg;
        const parsedPayload = Jwt.parseJsonPayload(payload);

        const signOptions: JsonWebToken.SignOptions = {
            algorithm,
            noTimestamp: true,
            header: {
                alg: algorithm,
                typ: 'JWT',
                ...headers,
            },
        };

        const token = JsonWebToken.sign(parsedPayload, Jwt.toSecret(privateKey), signOptions);

        const parts = token.split('.');

        if (parts.length !== 3) {
            throw new Error('JWT signing failed to produce 3 token parts.');
        }

        return new Jwt.Token(parts[0], parts[1], parts[2], token);
    }

    static verify(privateKey: PrivateKey, token: string, payload: string): boolean;
    static verify(publicKey: PublicKey, token: Jwt.Token): boolean;
    static verify(
        key: PrivateKey | PublicKey,
        tokenOrTokenObject: string | Jwt.Token,
        payload?: string,
    ): boolean {

        try {

            if (typeof tokenOrTokenObject === 'string') {
                if (payload == null) {
                    return false;
                }

                const parsedPayload = Jwt.parseJsonPayload(payload);
                const content = JsonWebToken.verify(tokenOrTokenObject, Jwt.toSecret(key));

                if (typeof content !== 'object' || content == null || Array.isArray(content)) {
                    return false;
                }

                return Jwt.toCanonicalJson(content) === Jwt.toCanonicalJson(parsedPayload);
            }

            JsonWebToken.verify(tokenOrTokenObject.full, Jwt.toSecret(key));

            return true;

        } catch {
            return false;
        }
    }

    private static toSecret(key: PrivateKey | PublicKey): JsonWebToken.Secret {
        return key.toBuffer();
    }

    private static parseJsonPayload(payload: string): Record<string, unknown> {
        try {
            const parsed = JSON.parse(payload) as unknown;

            if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
                throw new Error(Jwt.INVALID_JSON_PAYLOAD_ERROR);
            }

            return parsed as Record<string, unknown>;
        } catch {
            throw new Error(Jwt.INVALID_JSON_PAYLOAD_ERROR);
        }
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

        constructor(header: string, body: string, signature: string, full?: string) {
            if (header == null || body == null || signature == null) {
                throw new Error('JWT token parts cannot be null.');
            }

            this.header = header;
            this.body = body;
            this.signature = signature;
            this.full = full ?? `${header}.${body}.${signature}`;
        }
    }
}
