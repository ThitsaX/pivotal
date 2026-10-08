// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConfigService} from '@nestjs/config';
import {WebOutboundSettings} from '../../../packages/apps/web-outbound/required.settings';

const BASE_ENV: Record<string, string> = {
    REDIS_URL: 'redis://localhost:6379',
    REDIS_CACHE_ITEM_TIMEOUT_MS: '900000',
    FSPIOP_SWITCH_ID: 'hub',
    FSPIOP_PARTIES_URL: 'http://parties',
    FSPIOP_QUOTES_URL: 'http://quotes',
    FSPIOP_TRANSFERS_URL: 'http://transfers',
    FSPIOP_USE_JWS: 'false',
    FSPIOP_USE_MUTUAL_TLS: 'false',
    FSPIOP_TLS_VERIFY_SERVER_CERT: 'false',
    FSPIOP_TLS_VERIFY_DOMAIN: 'false',
    PREFIX_ORACLE_ENDPOINT: 'http://prefix-oracle',
    PREFIX_ORACLE_CACHE_TTL_MS: '180000',
};

function settings(overrides: Record<string, string> = {}): WebOutboundSettings {
    return new WebOutboundSettings(new ConfigService({...BASE_ENV, ...overrides}));
}

describe('WebOutboundSettings payer fee validation', () => {
    it('disables mandatory payer fees by default', () => {
        const outboundSettings = settings().outboundSettings();

        assert.equal(outboundSettings.checkPayerFeeAsMandatory, false);
    });

    it('reads the mandatory flag', () => {
        const outboundSettings = settings({
            CHECK_PAYER_FEE_AS_MANDATORY: 'true',
        }).outboundSettings();

        assert.equal(outboundSettings.checkPayerFeeAsMandatory, true);
    });

    it('rejects an invalid mandatory flag instead of silently disabling validation', () => {
        assert.throws(
            () => settings({CHECK_PAYER_FEE_AS_MANDATORY: 'ture'}).outboundSettings(),
            /Invalid environment variable CHECK_PAYER_FEE_AS_MANDATORY/,
        );
    });

    it('requires to.fspId by default', () => {
        const outboundSettings = settings().outboundSettings();
        assert.equal(outboundSettings.postSendmoneyPayeeFspIdRequired, true);
    });

    it('allows making to.fspId optional via env', () => {
        const outboundSettings = settings({
            POST_SENDMONEY_PAYEE_FSPID_REQUIRED: 'false',
        }).outboundSettings();
        assert.equal(outboundSettings.postSendmoneyPayeeFspIdRequired, false);
    });
    
    it('rejects an invalid payee fspId required flag', () => {
        assert.throws(
            () => settings({POST_SENDMONEY_PAYEE_FSPID_REQUIRED: 'ture'}).outboundSettings(),
            /Invalid environment variable POST_SENDMONEY_PAYEE_FSPID_REQUIRED/,
        );
    });

    it('defaults suspicious transaction monitoring to documented examples', () => {
        const outboundSettings = settings().outboundSettings();

        assert.equal(outboundSettings.suspiciousTxnMonitoringEnabled, true);
        assert.equal(outboundSettings.suspiciousTxnWindowMinutes, 3);
        assert.equal(outboundSettings.suspiciousTxnThreshold, 10);
        assert.equal(outboundSettings.suspiciousTxnWindowMs, 180_000);
        assert.deepEqual(outboundSettings.suspiciousTxnMatchingFields, [
            'payerFspId',
            'payerIdValue',
            'payeeFspId',
            'payeeIdValue',
            'amount',
        ]);
    });

    it('reads suspicious transaction monitoring env overrides', () => {
        const outboundSettings = settings({
            SUSPICIOUS_TRANSACTION_MONITORING_ENABLED: 'false',
            SUSPICIOUS_TRANSACTION_MONITORING_DURATION_MINUTES: '5',
            SUSPICIOUS_TRANSACTION_THRESHOLD: '20',
            SUSPICIOUS_TRANSACTION_MATCHING_FIELDS: 'payerIdValue,amount,currency',
        }).outboundSettings();

        assert.equal(outboundSettings.suspiciousTxnMonitoringEnabled, false);
        assert.equal(outboundSettings.suspiciousTxnWindowMinutes, 5);
        assert.equal(outboundSettings.suspiciousTxnThreshold, 20);
        assert.equal(outboundSettings.suspiciousTxnWindowMs, 300_000);
        assert.deepEqual(outboundSettings.suspiciousTxnMatchingFields, [
            'payerIdValue',
            'amount',
            'currency',
        ]);
    });

    it('rejects invalid suspicious transaction matching fields', () => {
        assert.throws(
            () => settings({
                SUSPICIOUS_TRANSACTION_MATCHING_FIELDS: 'payerFspId,notAField',
            }).outboundSettings(),
            /Invalid SUSPICIOUS_TRANSACTION_MATCHING_FIELDS value 'notAField'/,
        );
    });
});



describe('WebOutboundSettings Hub access token', () => {
    const OAUTH = {
        FSPIOP_OAUTH_TOKEN_URL: 'https://idp.example/token',
        FSPIOP_OAUTH_CLIENT_ID: 'pivotal',
        FSPIOP_OAUTH_CLIENT_SECRET: 'secret',
    };

    it('leaves the token off when none of the settings are given', () => {
        assert.equal(settings().outboundSettings().hubAccessToken, undefined);
    });

    it('reads all three settings', () => {
        const token = settings({...OAUTH, FSPIOP_SOCKET_TIMEOUT_MS: '5000'}).outboundSettings().hubAccessToken;

        assert.deepEqual(token, {
            tokenUrl: 'https://idp.example/token',
            clientId: 'pivotal',
            clientSecret: 'secret',
            timeoutMs: 5000,
        });
    });

    it('refuses a partial set instead of silently sending no token', () => {
        const {FSPIOP_OAUTH_CLIENT_SECRET: _omitted, ...partial} = OAUTH;

        assert.throws(() => settings(partial).outboundSettings(), /must be set together/);
    });
});
