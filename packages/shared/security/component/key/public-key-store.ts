import { PublicKey } from './public-key';
import { PublicKeyLoader } from './public-key-loader';

export class PublicKeyStore {

    constructor(private readonly loader: PublicKeyLoader) {}

    private readonly publicKeysByFspId = new Map<string, PublicKey>();

    load(): number {
        let loadedCount = 0;

        const keysByFspId = this.loader.load();

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
