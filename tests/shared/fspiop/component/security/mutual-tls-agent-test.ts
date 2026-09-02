import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import {AddressInfo} from 'node:net';
import {afterEach, beforeEach, describe, it} from 'node:test';
import * as forge from 'node-forge';
import {MutualTlsAgent} from '../../../../../packages/shared/fspiop/component/security/mutual-tls-agent';

const originalEnv = {...process.env};

let workDir: string;

/**
 * A throwaway certificate authority. Real material is used rather than a stub so
 * the test exercises the handshake itself: whether a client certificate is
 * actually presented, and whether the peer accepts it, are facts about TLS that a
 * mocked agent cannot show.
 */
class TestAuthority {

    private readonly key: forge.pki.rsa.KeyPair;
    readonly certificate: forge.pki.Certificate;

    constructor() {
        this.key = forge.pki.rsa.generateKeyPair(2048);
        this.certificate = TestAuthority.certify(
            'test-ca', this.key.publicKey, this.key.privateKey, 'test-ca', true);
    }

    caPem(): string {
        return forge.pki.certificateToPem(this.certificate);
    }

    /** A leaf signed by this authority, returned as the PEM pair a TLS peer needs. */
    issue(commonName: string): { cert: string; key: string } {
        const pair = forge.pki.rsa.generateKeyPair(2048);
        const certificate = TestAuthority.certify(
            commonName, pair.publicKey, this.key.privateKey, 'test-ca', false);

        return {
            cert: forge.pki.certificateToPem(certificate),
            key: forge.pki.privateKeyToPem(pair.privateKey),
        };
    }

    private static certify(
        commonName: string,
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
            {name: 'subjectAltName', altNames: [{type: 2, value: 'localhost'}]},
        ]);
        certificate.sign(signingKey, forge.md.sha256.create());

        return certificate;
    }
}

function write(name: string, contents: string): string {
    const file = path.join(workDir, name);

    fs.writeFileSync(file, contents, 'utf-8');

    return file;
}

/** Resolves to the common name the server saw on the client certificate. */
function callAndReadPresentedName(server: https.Server, agent: https.Agent): Promise<string> {
    const port = (server.address() as AddressInfo).port;

    return new Promise((resolve, reject) => {
        const request = https.request(
            {host: 'localhost', port, path: '/', method: 'GET', agent},
            response => {
                let body = '';

                response.on('data', chunk => body += chunk);
                response.on('end', () => resolve(body));
            });

        request.on('error', reject);
        request.end();
    });
}

beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutual-tls-agent-'));
});

afterEach(() => {
    process.env = {...originalEnv};
    fs.rmSync(workDir, {recursive: true, force: true});
});

describe('MutualTlsAgent', () => {

    it('should not build an agent when no material is configured', () => {
        assert.equal(MutualTlsAgent.create({rejectUnauthorized: true}), null);
    });

    it('should present the configured client certificate to a peer that requires one', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');
        const client = authority.issue('web-outbound');

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_CLIENT_CERT_PATH = write('tls.crt', client.cert);
        process.env.FSPIOP_MTLS_CLIENT_KEY_PATH = write('tls.key', client.key);

        const peer = https.createServer(
            {
                cert: server.cert,
                key: server.key,
                ca: authority.caPem(),
                requestCert: true,
                rejectUnauthorized: true,
            },
            (request, response) => {
                const presented = (request.socket as import('node:tls').TLSSocket).getPeerCertificate();

                response.end(presented.subject?.CN ?? '');
            });

        await new Promise<void>(resolve => peer.listen(0, '127.0.0.1', resolve));

        try {
            const agent = MutualTlsAgent.create({rejectUnauthorized: true});

            assert.ok(agent != null);
            assert.equal(await callAndReadPresentedName(peer, agent.httpsAgent()), 'web-outbound');
        } finally {
            await new Promise<void>(resolve => peer.close(() => resolve()));
        }
    });

    it('should present the renewed certificate after a reload, without a new agent', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');
        const first = authority.issue('web-outbound');
        const renewed = authority.issue('web-outbound-renewed');

        const caPath = write('ca.pem', authority.caPem());
        const certPath = write('tls.crt', first.cert);
        const keyPath = write('tls.key', first.key);

        process.env.FSPIOP_MTLS_CA_PATH = caPath;
        process.env.FSPIOP_MTLS_CLIENT_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_CLIENT_KEY_PATH = keyPath;

        const peer = https.createServer(
            {
                cert: server.cert,
                key: server.key,
                ca: authority.caPem(),
                requestCert: true,
                rejectUnauthorized: true,
            },
            (request, response) => {
                const presented = (request.socket as import('node:tls').TLSSocket).getPeerCertificate();

                response.end(presented.subject?.CN ?? '');
            });

        await new Promise<void>(resolve => peer.listen(0, '127.0.0.1', resolve));

        try {
            const agent = MutualTlsAgent.create({rejectUnauthorized: true});

            assert.ok(agent != null);

            const httpsAgent = agent.httpsAgent();

            assert.equal(await callAndReadPresentedName(peer, httpsAgent), 'web-outbound');

            // Standing in for cert-manager rewriting the mounted Secret in place.
            fs.writeFileSync(certPath, renewed.cert, 'utf-8');
            fs.writeFileSync(keyPath, renewed.key, 'utf-8');

            assert.equal(agent.reload(), true);
            assert.equal(agent.httpsAgent(), httpsAgent, 'the agent instance must survive a reload');

            // A fresh agent for the request, so the connection is new rather than pooled.
            assert.equal(await callAndReadPresentedName(peer, agent.httpsAgent()), 'web-outbound-renewed');
        } finally {
            await new Promise<void>(resolve => peer.close(() => resolve()));
        }
    });

    it('should report no change when a rewrite leaves the material identical', () => {
        const authority = new TestAuthority();
        const client = authority.issue('web-outbound');

        const certPath = write('tls.crt', client.cert);

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_CLIENT_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_CLIENT_KEY_PATH = write('tls.key', client.key);

        const agent = MutualTlsAgent.create({rejectUnauthorized: true});

        assert.ok(agent != null);

        // A Secret update rewrites the file whether or not the bytes changed, and
        // rebuilding the context for that would discard the connection pool for nothing.
        fs.writeFileSync(certPath, client.cert, 'utf-8');

        assert.equal(agent.reload(), false);
    });

    it('should keep serving with the loaded material when a reload fails', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');
        const client = authority.issue('web-outbound');

        const certPath = write('tls.crt', client.cert);

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_CLIENT_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_CLIENT_KEY_PATH = write('tls.key', client.key);

        const peer = https.createServer(
            {
                cert: server.cert,
                key: server.key,
                ca: authority.caPem(),
                requestCert: true,
                rejectUnauthorized: true,
            },
            (request, response) => {
                const presented = (request.socket as import('node:tls').TLSSocket).getPeerCertificate();

                response.end(presented.subject?.CN ?? '');
            });

        await new Promise<void>(resolve => peer.listen(0, '127.0.0.1', resolve));

        try {
            const agent = MutualTlsAgent.create({rejectUnauthorized: true});

            assert.ok(agent != null);

            // Half a certificate, as briefly seen while a mounted Secret is updated.
            fs.writeFileSync(certPath, client.cert.slice(0, 100), 'utf-8');

            assert.equal(agent.reload(), false);
            assert.equal(await callAndReadPresentedName(peer, agent.httpsAgent()), 'web-outbound');
        } finally {
            await new Promise<void>(resolve => peer.close(() => resolve()));
        }
    });
});
