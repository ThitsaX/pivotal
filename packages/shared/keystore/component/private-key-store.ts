import { Injectable } from '@nestjs/common';
import { PrivateKey } from './private-key';

@Injectable()
export class PrivateKeyStore {

    private readonly privateKeysByFspId = new Map<string, PrivateKey>();

    set(fspId: string, privateKey: PrivateKey | Buffer): void {
        const resolvedPrivateKey = privateKey instanceof PrivateKey
            ? privateKey
            : PrivateKey.fromBuffer(privateKey);

        this.privateKeysByFspId.set(fspId, resolvedPrivateKey);
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
}
