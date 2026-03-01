export class ClientCert {

    private constructor(
        private readonly cert: Buffer,
        private readonly key: Buffer,
    ) {}

    static fromBuffers(cert: Buffer, key: Buffer): ClientCert {
        return new ClientCert(Buffer.from(cert), Buffer.from(key));
    }

    certBuffer(): Buffer {
        return Buffer.from(this.cert);
    }

    keyBuffer(): Buffer {
        return Buffer.from(this.key);
    }
}
