// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConfigService} from '@nestjs/config';
import {WebOutboundSettings} from '../../../packages/apps/web-outbound/required.settings';
import {ApiType} from '../../../packages/shared/iso20022/api-type';

const BASE_ENV: Record<string, string> = {
    API_TYPE: 'fspiop',
    FSPIOP_TRANSFORM_VALIDATE_TARGET: 'false',
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

function settings(overrides: Record<string, string | undefined> = {}): WebOutboundSettings {
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
    it('reads an explicit FSPIOP Hub API type', () => {
        const outboundSettings = settings().outboundSettings();

        assert.equal(outboundSettings.fspiopSettings.apiType, ApiType.FSPIOP);
    });

    it('reads ISO 20022 Hub API type from env', () => {
        const outboundSettings = settings({API_TYPE: 'iso20022'}).outboundSettings();

        assert.equal(outboundSettings.fspiopSettings.apiType, ApiType.ISO20022);
    });

    for (const name of ['API_TYPE', 'FSPIOP_TRANSFORM_VALIDATE_TARGET']) {
        it(`requires ${name} instead of using a default`, () => {
            for (const value of [undefined, '', '   ']) {
                assert.throws(
                    () => settings({[name]: value}).outboundSettings(),
                    new RegExp(`Missing required environment variable: ${name}`),
                );
            }
        });
    }

    it('rejects an unsupported Hub API type', () => {
        assert.throws(
            () => settings({API_TYPE: 'xml'}).outboundSettings(),
            /Invalid API_TYPE/,
        );
    });

    it('passes the ISO target validation flag into runtime settings', () => {
        assert.equal(settings().outboundSettings().fspiopSettings.validateTarget, false);
        assert.equal(settings({FSPIOP_TRANSFORM_VALIDATE_TARGET: 'true'}).outboundSettings().fspiopSettings.validateTarget, true);
        assert.throws(
            () => settings({FSPIOP_TRANSFORM_VALIDATE_TARGET: 'ture'}).outboundSettings(),
            /FSPIOP_TRANSFORM_VALIDATE_TARGET.*boolean/,
        );
    });
});
