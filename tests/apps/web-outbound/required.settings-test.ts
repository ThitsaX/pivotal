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
            CHECK_PAYER_FEE_AS_MENDATORY: 'true',
        }).outboundSettings();

        assert.equal(outboundSettings.checkPayerFeeAsMandatory, true);
    });

    it('rejects an invalid mandatory flag instead of silently disabling validation', () => {
        assert.throws(
            () => settings({CHECK_PAYER_FEE_AS_MENDATORY: 'ture'}).outboundSettings(),
            /Invalid environment variable CHECK_PAYER_FEE_AS_MENDATORY/,
        );
    });
});
