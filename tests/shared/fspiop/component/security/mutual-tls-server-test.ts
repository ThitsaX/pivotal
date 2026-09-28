import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import * as tls from 'node:tls';
import {AddressInfo} from 'node:net';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {MutualTlsServer} from '../../../../../packages/shared/fspiop/component/security/mutual-tls-server';
import {TestAuthority} from './test-authority';

const originalEnv = {...process.env};

let workDir: string;

function write(name: string, contents: string): string {
    const file = path.join(workDir, name);

    fs.writeFileSync(file, contents, 'utf-8');

    return file;
}

/** Resolves to the common name on the certificate the listener presented. */
function connectAndReadPresentedName(
    server: https.Server,
    client: { cert: string; key: string },
    ca: string,
): Promise<string> {

    const port = (server.address() as AddressInfo).port;

    return new Promise((resolve, reject) => {
        const socket = tls.connect(
            {host: 'localhost', port, cert: client.cert, key: client.key, ca, servername: 'localhost'},
            () => {
                const presented = socket.getPeerCertificate();

                socket.end();
                resolve(presented.subject?.CN ?? '');
            });

        socket.on('error', reject);
    });
}

/** Rejects when the listener refuses to serve the caller. */
function request(server: https.Server, options: https.RequestOptions): Promise<string> {
    const port = (server.address() as AddressInfo).port;

    return new Promise((resolve, reject) => {
        const call = https.request(
            {host: 'localhost', port, path: '/', method: 'GET', ...options},
            response => {
                let body = '';

                response.on('data', chunk => body += chunk);
                response.on('end', () => resolve(body));
            });

        call.on('error', reject);
        call.end();
    });
}

async function listen(mutualTls: MutualTlsServer): Promise<https.Server> {
    const server = https.createServer(mutualTls.httpsOptions(), (_request, response) => response.end('ok'));

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    mutualTls.watch(server);

    return server;
}

async function close(server: https.Server, mutualTls: MutualTlsServer): Promise<void> {
    mutualTls.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
}

beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutual-tls-server-'));
});

afterEach(() => {
    process.env = {...originalEnv};
    fs.rmSync(workDir, {recursive: true, force: true});
});

describe('MutualTlsServer', () => {

    it('should refuse to start without a server certificate', () => {
        assert.throws(
            () => MutualTlsServer.create({requestClientCert: true}),
            /no server certificate is configured/);
    });

    it('should refuse to request client certificates it could not verify', () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');

        process.env.FSPIOP_MTLS_SERVER_CERT_PATH = write('tls.crt', server.cert);
        process.env.FSPIOP_MTLS_SERVER_KEY_PATH = write('tls.key', server.key);

        assert.throws(
            () => MutualTlsServer.create({requestClientCert: true}),
            /no certificate authority is configured/);
    });

    it('should present the configured server certificate and require a client certificate', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');
        const client = authority.issue('hub');

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_SERVER_CERT_PATH = write('tls.crt', server.cert);
        process.env.FSPIOP_MTLS_SERVER_KEY_PATH = write('tls.key', server.key);

        const mutualTls = MutualTlsServer.create({requestClientCert: true});
        const listener = await listen(mutualTls);

        try {
            assert.equal(await connectAndReadPresentedName(listener, client, authority.caPem()), 'localhost');

            // A caller with no certificate must not be served. Under TLS 1.3 the client
            // certificate is sent after the server's Finished, so the rejection arrives
            // on first use rather than at connect -- which is where it must be asserted.
            await assert.rejects(request(listener, {ca: authority.caPem()}));
        } finally {
            await close(listener, mutualTls);
        }
    });

    it('should present the renewed certificate after a reload, on the same listener', async () => {
        const authority = new TestAuthority();
        const first = authority.issue('localhost');
        const renewed = authority.issue('localhost-renewed', 'localhost');
        const client = authority.issue('hub');

        const certPath = write('tls.crt', first.cert);
        const keyPath = write('tls.key', first.key);

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_SERVER_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_SERVER_KEY_PATH = keyPath;

        const mutualTls = MutualTlsServer.create({requestClientCert: true});
        const listener = await listen(mutualTls);

        try {
            assert.equal(await connectAndReadPresentedName(listener, client, authority.caPem()), 'localhost');

            // Standing in for the enrolled certificate being renewed into the Secret.
            fs.writeFileSync(certPath, renewed.cert, 'utf-8');
            fs.writeFileSync(keyPath, renewed.key, 'utf-8');

            assert.equal(mutualTls.reload(), true);
            assert.equal(
                await connectAndReadPresentedName(listener, client, authority.caPem()),
                'localhost-renewed');
        } finally {
            await close(listener, mutualTls);
        }
    });

    it('should report no change when a rewrite leaves the material identical', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');

        const certPath = write('tls.crt', server.cert);

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_SERVER_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_SERVER_KEY_PATH = write('tls.key', server.key);

        const mutualTls = MutualTlsServer.create({requestClientCert: true});
        const listener = await listen(mutualTls);

        try {
            fs.writeFileSync(certPath, server.cert, 'utf-8');

            assert.equal(mutualTls.reload(), false);
        } finally {
            await close(listener, mutualTls);
        }
    });

    it('should keep serving with the loaded material when a reload fails', async () => {
        const authority = new TestAuthority();
        const server = authority.issue('localhost');
        const client = authority.issue('hub');

        const certPath = write('tls.crt', server.cert);

        process.env.FSPIOP_MTLS_CA_PATH = write('ca.pem', authority.caPem());
        process.env.FSPIOP_MTLS_SERVER_CERT_PATH = certPath;
        process.env.FSPIOP_MTLS_SERVER_KEY_PATH = write('tls.key', server.key);

        const mutualTls = MutualTlsServer.create({requestClientCert: true});
        const listener = await listen(mutualTls);

        try {
            // Half a certificate, as briefly seen while a mounted Secret is updated.
            fs.writeFileSync(certPath, server.cert.slice(0, 100), 'utf-8');

            assert.equal(mutualTls.reload(), false);
            assert.equal(await connectAndReadPresentedName(listener, client, authority.caPem()), 'localhost');
        } finally {
            await close(listener, mutualTls);
        }
    });
});
