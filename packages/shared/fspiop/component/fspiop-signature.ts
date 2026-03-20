import {Jwt} from '@shared/security/component/jwt';
import {PrivateKey} from '@shared/security/component/key/private-key';
import {PublicKey} from '@shared/security/component/key/public-key';

type FspiopPrivateKey = PrivateKey;
type FspiopPublicKey = PublicKey;

export class FspiopSignature {

    private static readonly INVALID_JSON_PAYLOAD_ERROR = 'FSPIOP signature payload must be a valid JSON object.';

    static sign(
        privateKey: FspiopPrivateKey,
        headers: Record<string, string>,
        payload: string,
    ): FspiopSignature.Header {

        const signedToken = Jwt.sign(privateKey, headers, FspiopSignature.toJsonPayload(payload));

        return {
            signature: signedToken.signature,
            protectedHeader: signedToken.header,
        };
    }

    static verify(publicKey: FspiopPublicKey, token: Jwt.Token): boolean {
        return Jwt.verify(publicKey, token);
    }

    private static toJsonPayload(payload: string): Record<string, unknown> {
        try {
            const parsed = JSON.parse(payload) as unknown;

            if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
                throw new Error(FspiopSignature.INVALID_JSON_PAYLOAD_ERROR);
            }

            return parsed as Record<string, unknown>;
        } catch {
            throw new Error(FspiopSignature.INVALID_JSON_PAYLOAD_ERROR);
        }
    }
}

export namespace FspiopSignature {

    export interface Header {
        signature: string;
        protectedHeader: string;
    }

    export type Token = Jwt.Token;
}
