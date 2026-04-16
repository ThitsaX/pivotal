import {Inject, Injectable} from '@nestjs/common';
import {PrivateKey, PrivateKeyStore} from '@shared/security';
import {ParticipantSigningKeysCache} from './participant-signing-keys-cache';

@Injectable()
export class ParticipantJwsPrivateKeyStore extends PrivateKeyStore {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly participantSigningKeysCache: ParticipantSigningKeysCache,
    ) {
        super();
    }

    load(): PrivateKeyStore {
        this.participantSigningKeysCache.load();
        return this;
    }

    get(fspId: string): PrivateKey | undefined {
        const privateKey = this.participantSigningKeysCache.getPrivateKeyPem(fspId);

        if (privateKey == null) {
            return undefined;
        }

        return PrivateKey.fromBuffer(Buffer.from(privateKey, 'utf-8'));
    }
}
