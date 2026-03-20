import {
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopHeadersMap,
    FspiopSettings,
    FspiopSignature,
} from '@shared/fspiop';
import {PrivateKeyStore} from '@shared/security';

export class FspiopSigner {

    constructor(
        private readonly fspiopSettings: FspiopSettings,
        private readonly privateKeyStore: PrivateKeyStore,
    ) {
    }

    sign(
        headers: FspiopHeadersMap,
        payload: string,
    ): FspiopSignature.Header | undefined {
        if (!this.fspiopSettings.useJws) {
            return undefined;
        }

        const source = headers[FspiopHeaders.Names.FSPIOP_SOURCE]?.trim();

        if (source == null || source.length === 0) {
            throw new FspiopException(
                FspiopErrors.GENERIC_SERVER_ERROR,
                'fspiop-source is required to generate fspiop-signature.',
            );
        }

        const privateKey = this.privateKeyStore.get(source);

        if (privateKey == null) {
            throw new FspiopException(
                FspiopErrors.GENERIC_SERVER_ERROR,
                `Private key is required to generate fspiop-signature for source "${source}".`,
            );
        }

        return FspiopSignature.sign(privateKey, headers, payload);
    }
}
