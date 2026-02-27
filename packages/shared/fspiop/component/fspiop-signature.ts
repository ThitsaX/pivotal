import {Jwt} from '@shared/security/component/jwt';

type FspiopSignatureKey = Parameters<typeof Jwt.sign>[0];

export class FspiopSignature {

    static sign(
        privateKey: FspiopSignatureKey,
        headers: Record<string, string>,
        payload: string,
    ): FspiopSignature.Header {

        const signedToken = Jwt.sign(privateKey, headers, payload);

        return {
            signature: signedToken.signature,
            protectedHeader: signedToken.header,
        };
    }

    static verify(publicKey: FspiopSignatureKey, token: Jwt.Token): boolean {
        return Jwt.verify(publicKey, token);
    }
}

export namespace FspiopSignature {

    export interface Header {
        signature: string;
        protectedHeader: string;
    }

    export type Token = Jwt.Token;
}
