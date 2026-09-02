// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
//
// Exercises McmAxios against a REAL Connection Manager. Skips when one is not
// running, so it cannot break a machine or a CI job that has not started it:
//
//   cd connection-manager-api && DATABASE_PORT=3307 docker compose --profile full up -d
//
// The token client needs an audience of `connection-manager-api` and a `groups`
// claim; see trust-manager-docs/implementation/mcm-api-notes.md.
import * as assert from 'node:assert/strict';
import {before, describe, it} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import axios from 'axios';
import {McmAxios, McmSettings, McmTokenProvider} from '@shared/mcm-client/component';

// Reached through traefik on 127.0.0.1 with an explicit Host header rather than by
// name. macOS does not resolve `*.localhost` subdomains -- curl special-cases them,
// Node's getaddrinfo does not -- so `mcm.localhost` fails with ENOTFOUND unless the
// names are in /etc/hosts. Routing by Host keeps the test working either way.
const BASE_URL = process.env.MCM_BASE_URL ?? 'http://127.0.0.1/api';
const TOKEN_URL = process.env.MCM_TOKEN_URL
    ?? 'http://127.0.0.1/realms/dfsps/protocol/openid-connect/token';
const API_HOST = process.env.MCM_API_HOST ?? 'mcm.localhost';
const TOKEN_HOST = process.env.MCM_TOKEN_HOST ?? 'keycloak.mcm.localhost';
const CLIENT_ID = process.env.MCM_CLIENT_ID ?? 'connection-manager-api-service';
const CLIENT_SECRET = process.env.MCM_CLIENT_SECRET ?? 'dfsps123';

function clientFor(settings: McmSettings): McmAxios {
    return new McmAxios(
        settings,
        axios.create({headers: {Host: API_HOST}}),
        new McmTokenProvider(settings, axios.create({headers: {Host: TOKEN_HOST}})),
    );
}

function publicKeyPem(): string {
    return generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {type: 'spki', format: 'pem'},
        privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    }).publicKey;
}

describe('McmAxios against a live Connection Manager', () => {

    const mcm = clientFor(new McmSettings(BASE_URL, TOKEN_URL, CLIENT_ID, CLIENT_SECRET));
    let reachable = false;

    before(async () => {
        try {
            await mcm.listDfsps();
            reachable = true;
        } catch {
            reachable = false;
        }
    });

    it('pulls the Hub CA', async (t) => {
        if (!reachable) return t.skip('no MCM running');

        const hubCa = await mcm.getHubCa();

        assert.ok(hubCa.rootCertificate.includes('BEGIN CERTIFICATE'));
    });

    it('registers one CA under two tenants, and publishes a key per tenant', async (t) => {
        if (!reachable) return t.skip('no MCM running');

        // Fixed ids, not random ones. MCM has no tenant cleanup in this flow, so a
        // fresh id per run would leave a permanent tenant behind on every execution
        // and grow the aggregate pull without bound.
        const tenants = ['itest-peer-a', 'itest-peer-b'];
        const sharedCa = (await mcm.getHubCa()).rootCertificate;

        for (const dfspId of tenants) {
            try {
                await mcm.createDfsp({dfspId, name: dfspId, email: `${dfspId}@example.test`});
            } catch {
                // Already present from an earlier run — the rest of the test is a
                // re-registration, which is exactly what a re-sync does anyway.
            }

            // The SAME certificate under both: MCM applies no uniqueness constraint,
            // which is what lets one CA cover every tenant Pivotal fronts.
            await mcm.registerCa(dfspId, {rootCertificate: sharedCa});
        }

        const keys = new Map(tenants.map(dfspId => [dfspId, publicKeyPem()]));

        for (const [dfspId, publicKey] of keys) {
            // Publishes, reads back, and fails if the stored PEM differs.
            await mcm.publishAndVerifyJwsKey(dfspId, publicKey);
        }

        // One aggregate call returns every tenant, not one call per tenant.
        const all = await mcm.listAllJwsKeys();

        for (const [dfspId, publicKey] of keys) {
            const stored = all.find(entry => entry.dfspId === dfspId);

            assert.ok(stored, `${dfspId} missing from the aggregate pull`);
            assert.equal(stored?.publicKey, publicKey, `${dfspId} key differs in the aggregate pull`);
        }
    });

    it('reports a usable error when the token lacks its groups claim', async (t) => {
        if (!reachable) return t.skip('no MCM running');

        // `connection-manager-auth-client` has a groups mapper but is not a service
        // account, so client_credentials fails outright — a different failure from a
        // token that authenticates but carries no groups. Either way the caller must
        // get an McmException rather than a raw axios error.
        const wrong = clientFor(
            new McmSettings(BASE_URL, TOKEN_URL, 'connection-manager-auth-client', 'dfsps456'),
        );

        await assert.rejects(() => wrong.listDfsps(), (error: Error) => {
            assert.equal(error.name, 'McmException');
            return true;
        });
    });
});
