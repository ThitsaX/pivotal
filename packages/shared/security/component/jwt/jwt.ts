import * as JsonWebToken from 'jsonwebtoken';

export class Jwt {

    private constructor() {
    }

    static decode(base64Url: string): string {
        return Buffer.from(base64Url, 'base64url').toString('utf-8');
    }

    static encode(json: string): string {
        return Buffer.from(json, 'utf-8').toString('base64url');
    }

    static sign(
        privateKey: JsonWebToken.Secret,
        headers: Record<string, string>,
        payload: string,
    ): Jwt.Token;
    static sign(
        privateKey: JsonWebToken.Secret,
        algorithm: JsonWebToken.Algorithm,
        headers: Record<string, string>,
        payload: string,
    ): Jwt.Token;
    static sign(
        privateKey: JsonWebToken.Secret,
        algorithmOrHeaders: JsonWebToken.Algorithm | Record<string, string>,
        headersOrPayload: Record<string, string> | string,
        payloadArg?: string,
    ): Jwt.Token {

        const algorithm = payloadArg == null ? 'RS256' : algorithmOrHeaders as JsonWebToken.Algorithm;

        const headers = payloadArg == null
            ? algorithmOrHeaders as Record<string, string>
            : headersOrPayload as Record<string, string>;

        const payload = payloadArg == null ? headersOrPayload as string : payloadArg;

        const token = JsonWebToken.sign(payload, privateKey, {
            algorithm,
            noTimestamp: true,
            header: {
                alg: algorithm,
                typ: 'JWT',
                ...headers,
            },
        });

        const parts = token.split('.');

        if (parts.length !== 3) {
            throw new Error('JWT signing failed to produce 3 token parts.');
        }

        return new Jwt.Token(parts[0], parts[1], parts[2], token);
    }

    static verify(secretKey: JsonWebToken.Secret, token: string, payload: string): boolean;
    static verify(publicKey: JsonWebToken.Secret, token: Jwt.Token): boolean;
    static verify(
        key: JsonWebToken.Secret,
        tokenOrTokenObject: string | Jwt.Token,
        payload?: string,
    ): boolean {

        try {

            if (typeof tokenOrTokenObject === 'string') {
                if (payload == null) {
                    return false;
                }

                const content = JsonWebToken.verify(tokenOrTokenObject, key);

                return typeof content === 'string' && content === payload;
            }

            JsonWebToken.verify(tokenOrTokenObject.full, key);

            return true;

        } catch {
            return false;
        }
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
