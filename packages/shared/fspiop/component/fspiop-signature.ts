import {Jwt} from '@shared/security/component/jwt';
import {PrivateKey} from '@shared/security/component/key/private-key';
import {PublicKey} from '@shared/security/component/key/public-key';

type FspiopPrivateKey = PrivateKey;
type FspiopPublicKey = PublicKey;

export class FspiopSignature {

    static sign(
        privateKey: FspiopPrivateKey,
        headers: Record<string, string>,
        payload: string,
    ): FspiopSignature.Header {

        const signedToken = Jwt.sign(privateKey, headers, payload);

        return {
            signature: signedToken.signature,
            protectedHeader: signedToken.header,
        };
    }

    static verify(publicKey: FspiopPublicKey, token: Jwt.Token): boolean {
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
