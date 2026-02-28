export class PublicKey {

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): PublicKey {
        return new PublicKey(value);
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
