import * as forge from 'node-forge';

/**
 * A throwaway certificate authority.
 *
 * Real material is used rather than a stub so the tests exercise the handshake
 * itself: whether a certificate is actually presented, and whether the peer accepts
 * it, are facts about TLS that a mocked agent or listener cannot show.
 */
export class TestAuthority {

    private readonly key: forge.pki.rsa.KeyPair;
    readonly certificate: forge.pki.Certificate;

    constructor() {
        this.key = forge.pki.rsa.generateKeyPair(2048);
        this.certificate = TestAuthority.certify(
            'test-ca', 'test-ca', this.key.publicKey, this.key.privateKey, 'test-ca', true);
    }

    caPem(): string {
        return forge.pki.certificateToPem(this.certificate);
    }

    /**
     * A leaf signed by this authority, returned as the PEM pair a TLS peer needs.
     *
     * The subject alternative name defaults to the common name, and is separable so a
     * test can distinguish two certificates by name while both stay valid for the host
     * the peer connects to.
     */
    issue(commonName: string, subjectAltName: string = commonName): { cert: string; key: string } {
        const pair = forge.pki.rsa.generateKeyPair(2048);
        const certificate = TestAuthority.certify(
            commonName, subjectAltName, pair.publicKey, this.key.privateKey, 'test-ca', false);

        return {
            cert: forge.pki.certificateToPem(certificate),
            key: forge.pki.privateKeyToPem(pair.privateKey),
        };
    }

    private static certify(
        commonName: string,
        subjectAltName: string,
        publicKey: forge.pki.rsa.PublicKey,
        signingKey: forge.pki.rsa.PrivateKey,
        issuerCommonName: string,
        isAuthority: boolean,
    ): forge.pki.Certificate {

        const certificate = forge.pki.createCertificate();

        certificate.publicKey = publicKey;
        certificate.serialNumber = Date.now().toString(16) + Math.floor(Math.random() * 1e6).toString(16);
        certificate.validity.notBefore = new Date(Date.now() - 60_000);
        certificate.validity.notAfter = new Date(Date.now() + 3_600_000);
        certificate.setSubject([{name: 'commonName', value: commonName}]);
        certificate.setIssuer([{name: 'commonName', value: issuerCommonName}]);
        certificate.setExtensions([
            {name: 'basicConstraints', cA: isAuthority},
            {name: 'subjectAltName', altNames: [{type: 2, value: subjectAltName}]},
        ]);
        certificate.sign(signingKey, forge.md.sha256.create());

        return certificate;
    }
}
