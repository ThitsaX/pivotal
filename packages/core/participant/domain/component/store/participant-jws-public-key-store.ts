import {PublicKey, PublicKeyStore} from '@shared/security';
import {ParticipantSigningKeysCache} from './participant-signing-keys-cache';
import {Inject, Injectable} from "@nestjs/common";

@Injectable()
export class ParticipantJwsPublicKeyStore extends PublicKeyStore {

    constructor(
        @Inject(ParticipantSigningKeysCache)
        private readonly participantSigningKeysCache: ParticipantSigningKeysCache,
    ) {
        super();
    }

    load(): PublicKeyStore {
        this.participantSigningKeysCache.load();
        return this;
    }

    get(fspId: string): PublicKey | undefined {
        const publicKey = this.participantSigningKeysCache.getPublicKeyPem(fspId);

        if (publicKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(Buffer.from(publicKey, 'utf-8'));
    }
}
