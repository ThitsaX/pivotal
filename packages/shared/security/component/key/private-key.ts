export class PrivateKey {

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): PrivateKey {
        return new PrivateKey(value);
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
