import { Injectable } from '@nestjs/common';
import { PublicKey } from './public-key';
import { PublicKeyLoader } from './public-key-loader';

@Injectable()
export class PublicKeyStore {

    private readonly publicKeysByFspId = new Map<string, PublicKey>();

    load(loader: PublicKeyLoader): number {
        let loadedCount = 0;

        const keysByFspId = loader.load();

        for (const [fspId, publicKey] of keysByFspId.entries()) {
            this.put(fspId, publicKey);
            loadedCount += 1;
        }

        return loadedCount;
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

    private put(fspId: string, publicKey: PublicKey): void {
        this.publicKeysByFspId.set(fspId, PublicKey.fromBuffer(publicKey.toBuffer()));
    }
}
