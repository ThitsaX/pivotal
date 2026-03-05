import { PrivateKey } from './private-key';
import { PrivateKeyLoader } from './private-key-loader';

export class PrivateKeyStore {

    constructor(private readonly loader: PrivateKeyLoader) {}

    private readonly privateKeysByFspId = new Map<string, PrivateKey>();

    load(): number {
        let loadedCount = 0;

        const keysByFspId = this.loader.load();

        for (const [fspId, privateKey] of keysByFspId.entries()) {
            this.put(fspId, privateKey);
            loadedCount += 1;
        }

        return loadedCount;
    }

    get(fspId: string): PrivateKey | undefined {
        const privateKey = this.privateKeysByFspId.get(fspId);

        if (privateKey == null) {
            return undefined;
        }

        return PrivateKey.fromBuffer(privateKey.toBuffer());
    }

    getBuffer(fspId: string): Buffer | undefined {
        const privateKey = this.privateKeysByFspId.get(fspId);

        return privateKey == null ? undefined : privateKey.toBuffer();
    }

    has(fspId: string): boolean {
        return this.privateKeysByFspId.has(fspId);
    }

    delete(fspId: string): boolean {
        return this.privateKeysByFspId.delete(fspId);
    }

    clear(): void {
        this.privateKeysByFspId.clear();
    }

    private put(fspId: string, privateKey: PrivateKey): void {
        this.privateKeysByFspId.set(fspId, PrivateKey.fromBuffer(privateKey.toBuffer()));
    }
}
