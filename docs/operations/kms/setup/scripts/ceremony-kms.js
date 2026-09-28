// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
//
// The CA root ceremony against AWS KMS. Run once per deployment, per trust domain.
//
//   node scripts/ceremony-kms.js
//
// Must run from the repository root so node-forge resolves.
//
// KMS is not a certificate authority. It will not issue a certificate; it signs a
// digest and nothing more. This script builds the X.509 itself and asks KMS only to
// sign the hash of the to-be-signed bytes -- which is why the same script serves a
// CloudHSM deployment with one call swapped, and why Vault needs no KMS integration
// of any kind.
//
//   1. get the public half            aws kms get-public-key
//   2. build the TBSCertificate       here
//   3. SHA-256 it                     here
//   4. sign the digest                aws kms sign --message-type DIGEST
//   5. splice signature onto the cert here
//
// The private half has no export API. It is a property of the service, not a flag.
//
// The two roots MUST stay separate: merging them would make a DFSP's client
// certificate trusted by the Hub.
'use strict';

const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const forge = require('node-forge');

const OUT = process.env.CEREMONY_OUT
    || path.join(process.env.TMPDIR || '/tmp', 'pivotal-ceremony-kms');
const VAULT_NS = process.env.VAULT_NS || 'vault';
const VAULT_POD = process.env.VAULT_POD || 'vault-0';
const VAULT_TOKEN = process.env.VAULT_DEV_ROOT_TOKEN || 'root-dev';
const PIVOTAL_NS = process.env.PIVOTAL_NS || 'pivotal';

const DOMAINS = [
    {mount: 'pki_hub_client', alias: process.env.HUB_CLIENT_KEY_ALIAS
        || 'alias/pivotal-hub-client-root-ca-rehearsal', cn: 'Pivotal Hub Client CA',
     role: 'pivotal-client', publishAs: 'pivotal-ca-bundle',
     roleArgs: 'client_flag=true server_flag=false max_ttl=2160h ttl=2160h ou=Pivotal require_cn=false'},
    {mount: 'pki_dfsp', alias: process.env.DFSP_KEY_ALIAS
        || 'alias/pivotal-dfsp-root-ca-rehearsal', cn: 'Pivotal DFSP-Facing CA',
     role: 'dfsp-client', roleArgs: 'client_flag=true server_flag=false max_ttl=8760h ttl=8760h ou=DFSP require_cn=true'},
];

const aws = (...args) => execFileSync('aws', args, {maxBuffer: 1 << 26}).toString();
const vault = (script, input) => execFileSync(
    'kubectl',
    ['exec', '-n', VAULT_NS, '-i', VAULT_POD, '--', 'sh', '-c',
        `export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=${VAULT_TOKEN}; ${script}`],
    {input: input ?? '', maxBuffer: 1 << 26},
).toString();

/** The only step KMS performs. */
function kmsSign(alias, tbsDerBinary) {
    const digest = createHash('sha256').update(Buffer.from(tbsDerBinary, 'binary')).digest();
    const file = path.join(OUT, 'tbs.digest');

    fs.writeFileSync(file, digest);

    const out = JSON.parse(aws('kms', 'sign', '--key-id', alias,
        '--message', `fileb://${file}`, '--message-type', 'DIGEST',
        '--signing-algorithm', 'RSASSA_PKCS1_V1_5_SHA_256', '--output', 'json'));

    fs.unlinkSync(file);

    return Buffer.from(out.Signature, 'base64').toString('binary');
}

function kmsPublicKey(alias) {
    const der = JSON.parse(aws('kms', 'get-public-key', '--key-id', alias, '--output', 'json')).PublicKey;

    return forge.pki.publicKeyFromAsn1(
        forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(der, 'base64').toString('binary'))));
}

function nameOf(cn) {
    return [{name: 'organizationName', value: 'ThitsaWorks'}, {name: 'commonName', value: cn}];
}

/** Self-signed root. The key never leaves KMS; only this certificate does. */
function buildRoot(alias, cn) {
    const cert = forge.pki.createCertificate();

    cert.publicKey = kmsPublicKey(alias);
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 3650 * 864e5);
    cert.setSubject(nameOf(`${cn} Root`));
    cert.setIssuer(nameOf(`${cn} Root`));
    cert.setExtensions([
        {name: 'basicConstraints', cA: true, critical: true},
        {name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true},
        {name: 'subjectKeyIdentifier'},
    ]);
    cert.siginfo.algorithmOid = cert.signatureOid = forge.pki.oids.sha256WithRSAEncryption;
    cert.signature = kmsSign(alias, forge.asn1.toDer(forge.pki.getTBSCertificate(cert)).getBytes());

    return cert;
}

/** The root signs the intermediate exactly once, here. */
function signIntermediate(alias, root, csrPem) {
    const csr = forge.pki.certificationRequestFromPem(csrPem);

    if (!csr.verify()) {
        throw new Error('The intermediate CSR does not verify against its own public key.');
    }

    const cert = forge.pki.createCertificate();

    cert.publicKey = csr.publicKey;
    cert.serialNumber = '02';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 1825 * 864e5);
    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(root.subject.attributes);
    cert.setExtensions([
        {name: 'basicConstraints', cA: true, critical: true, pathLenConstraint: 0},
        {name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true},
        {name: 'subjectKeyIdentifier'},
    ]);
    cert.siginfo.algorithmOid = cert.signatureOid = forge.pki.oids.sha256WithRSAEncryption;
    cert.signature = kmsSign(alias, forge.asn1.toDer(forge.pki.getTBSCertificate(cert)).getBytes());

    return cert;
}

/**
 * An empty root CRL, signed by KMS.
 *
 * Written now rather than later on purpose: revoking an intermediate requires a
 * root-signed CRL, and that is far easier to produce while the ceremony tooling is
 * open than to work out during an incident. node-forge has no CRL support, so the
 * structure is assembled directly.
 */
function buildRootCrl(alias, rootPem) {
    const {asn1} = forge;
    const rootDer = forge.asn1.fromDer(
        forge.util.createBuffer(forge.pki.pemToDer(rootPem).getBytes()));
    // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
    // TBSCertificate ::= SEQUENCE { [0] version, serial, signature, issuer, ... }
    const tbs = rootDer.value[0];
    const algorithmIdentifier = tbs.value[2];
    const issuer = tbs.value[3];

    const utcTime = (date) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false,
        asn1.dateToUtcTime(date));

    // TBSCertList ::= SEQUENCE { version, signature, issuer, thisUpdate, nextUpdate }
    // No revokedCertificates: at ceremony time nothing has been revoked.
    const tbsCertList = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false,
            asn1.integerToDer(1).getBytes()),
        algorithmIdentifier,
        issuer,
        utcTime(new Date()),
        utcTime(new Date(Date.now() + 365 * 864e5)),
    ]);

    const signature = kmsSign(alias, asn1.toDer(tbsCertList).getBytes());

    const crl = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        tbsCertList,
        algorithmIdentifier,
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false, '\x00' + signature),
    ]);

    return `-----BEGIN X509 CRL-----\r\n`
        + forge.util.encode64(asn1.toDer(crl).getBytes(), 64)
        + `\r\n-----END X509 CRL-----\r\n`;
}

function ceremony(domain) {
    const out = path.join(OUT, domain.mount);

    fs.mkdirSync(out, {recursive: true});
    console.log(`\n-- ${domain.cn} ------------------------------------`);

    const root = buildRoot(domain.alias, domain.cn);
    const rootPem = forge.pki.certificateToPem(root);

    fs.writeFileSync(path.join(out, 'root.pem'), rootPem);
    console.log(`  root signed by KMS: ${domain.alias}`);

    // The intermediate's private half is generated inside Vault and stays there.
    vault(`vault secrets disable ${domain.mount} 2>/dev/null || true`);
    vault(`vault secrets enable -path=${domain.mount} -max-lease-ttl=43800h pki`);

    const csrPem = vault(`vault write -field=csr ${domain.mount}/intermediate/generate/internal `
        + `common_name='${domain.cn} Intermediate' key_bits=2048`);

    const interPem = forge.pki.certificateToPem(signIntermediate(domain.alias, root, csrPem));

    fs.writeFileSync(path.join(out, 'inter.pem'), interPem);
    console.log('  intermediate signed by the KMS root');

    vault(`cat > /tmp/i.crt; vault write ${domain.mount}/intermediate/set-signed certificate=@/tmp/i.crt`, interPem);
    console.log(`  intermediate installed in Vault mount '${domain.mount}'`);

    // Disabling the mount above destroyed its roles, so put the issuing role back.
    vault(`vault write ${domain.mount}/roles/${domain.role} allow_any_name=true `
        + `enforce_hostnames=false key_bits=2048 organization=ThitsaWorks no_store=true ${domain.roleArgs}`);
    console.log(`  role restored: ${domain.mount}/roles/${domain.role}`);

    fs.writeFileSync(path.join(out, 'root.crl'), buildRootCrl(domain.alias, rootPem));
    console.log('  root CRL signed by KMS');

    // The Hub-facing root has to reach the cluster: trust-manager registers it with
    // MCM under every tenant. Only the certificate goes -- the private half stays in
    // KMS and has no export API. The DFSP-facing root is not published here; what
    // consumes that one is the DFSP, which downloads it with its signed certificate.
    if (domain.publishAs != null) {
        execFileSync('sh', ['-c',
            `kubectl create secret generic ${domain.publishAs} -n ${PIVOTAL_NS} `
            + `--from-file=ca.pem='${path.join(out, 'root.pem')}' `
            + `--dry-run=client -o yaml | kubectl apply -f -`], {stdio: 'ignore'});
        console.log(`  root published to Secret ${PIVOTAL_NS}/${domain.publishAs}`);
    }
}

fs.mkdirSync(OUT, {recursive: true});
DOMAINS.forEach(ceremony);
console.log(`\nRoots are in AWS KMS. Public certificates and CRLs under ${OUT}\n`);
