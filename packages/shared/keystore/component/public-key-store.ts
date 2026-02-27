import { Injectable } from '@nestjs/common';
import { PublicKey } from './public-key';

@Injectable()
export class PublicKeyStore {

    private readonly publicKeysByFspId = new Map<string, PublicKey>();

    set(fspId: string, publicKey: PublicKey | Buffer): void {
        const resolvedPublicKey = publicKey instanceof PublicKey
            ? publicKey
            : PublicKey.fromBuffer(publicKey);

        this.publicKeysByFspId.set(fspId, resolvedPublicKey);
    }

    get(fspId: string): PublicKey | undefined {
        const publicKey = this.publicKeysByFspId.get(fspId);

        if (publicKey == null) {
            return undefined;
        }

        return PublicKey.fromBuffer(publicKey.toBuffer());
    }

    getBuffer(fspId: string): Buffer | undefined {
        const publicKey = this.publicKeysByFspId.get(fspId);

        return publicKey == null ? undefined : publicKey.toBuffer();
    }

    has(fspId: string): boolean {
        return this.publicKeysByFspId.has(fspId);
    }

    delete(fspId: string): boolean {
        return this.publicKeysByFspId.delete(fspId);
    }

    clear(): void {
        this.publicKeysByFspId.clear();
    }
}
