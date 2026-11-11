// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConfigService} from '@nestjs/config';
import {Test} from '@nestjs/testing';
import {CommandBus} from '@nestjs/cqrs';
import {PartiesController, QuotesController, TransfersController} from '../../../packages/apps/web-inbound/controllers';
import {FspiopSettings} from '../../../packages/shared/fspiop/component/fspiop-settings';
import {ApiType} from '../../../packages/shared/iso20022/api-type';
import {TransformFacades} from '@mojaloop/ml-schema-transformer-lib';
import {WebInboundSettings} from '../../../packages/apps/web-inbound/required.settings';
import {WebOutboundSettings} from '../../../packages/apps/web-outbound/required.settings';
import {Iso20022Transformer} from '../../../packages/shared/iso20022/iso20022-transformer';

describe('ISO 20022 target validation settings', () => {
    const baseEnv = {
        API_TYPE: 'iso20022',
        FSPIOP_TRANSFORM_VALIDATE_TARGET: 'true',
        FSPIOP_SWITCH_ID: 'hub',
        FSPIOP_PARTIES_URL: 'http://parties',
        FSPIOP_QUOTES_URL: 'http://quotes',
        FSPIOP_TRANSFERS_URL: 'http://transfers',
        FSPIOP_USE_JWS: 'false',
        FSPIOP_USE_MUTUAL_TLS: 'false',
        FSPIOP_TLS_VERIFY_SERVER_CERT: 'false',
        FSPIOP_TLS_VERIFY_DOMAIN: 'false',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_CACHE_ITEM_TIMEOUT_MS: '900000',
        PREFIX_ORACLE_ENDPOINT: 'http://prefix-oracle',
        PREFIX_ORACLE_CACHE_TTL_MS: '180000',
    };
    const runtimeSettings = (
        Settings: typeof WebInboundSettings | typeof WebOutboundSettings,
        overrides: Record<string, string | undefined> = {},
    ): FspiopSettings => {
        const settings = new Settings(new ConfigService({...baseEnv, ...overrides}));
        return settings instanceof WebInboundSettings
            ? settings.fspiopSettings()
            : settings.outboundSettings().fspiopSettings;
    };

    it('passes the inbound environment flag into runtime settings', () => {
        const settings = runtimeSettings(WebInboundSettings);
        assert.equal(settings.validateTarget, true);
        assert.equal(settings.apiType, ApiType.ISO20022);
    });

    it('requires an inbound API type instead of defaulting to FSPIOP', () => {
        for (const value of [undefined, '', '   ']) {
            assert.throws(() => runtimeSettings(WebInboundSettings, {API_TYPE: value}), /Missing required environment variable: API_TYPE/);
        }
    });

    it('rejects an unsupported inbound API type', () => {
        assert.throws(() => runtimeSettings(WebInboundSettings, {API_TYPE: 'xml'}), /Invalid API_TYPE/);
    });

    for (const Settings of [WebInboundSettings, WebOutboundSettings]) {
        describe(Settings.name, () => {
            it('requires the validation flag instead of defaulting to disabled', () => {
                for (const value of [undefined, '', '   ']) {
                    assert.throws(() => runtimeSettings(Settings, {FSPIOP_TRANSFORM_VALIDATE_TARGET: value}), /Missing required environment variable: FSPIOP_TRANSFORM_VALIDATE_TARGET/);
                }
            });

            it('reads supported boolean values', () => {
                for (const value of ['true', '1', 'yes', ' TRUE ']) {
                    assert.equal(runtimeSettings(Settings, {FSPIOP_TRANSFORM_VALIDATE_TARGET: value}).validateTarget, true);
                }
                for (const value of ['false', '0', 'no', ' FALSE ']) {
                    assert.equal(runtimeSettings(Settings, {FSPIOP_TRANSFORM_VALIDATE_TARGET: value}).validateTarget, false);
                }
            });

            it('rejects an invalid flag', () => {
                assert.throws(() => runtimeSettings(Settings, {FSPIOP_TRANSFORM_VALIDATE_TARGET: 'ture'}), /FSPIOP_TRANSFORM_VALIDATE_TARGET.*boolean/);
            });
        });
    }
});

function transformerSettings(validateTarget: boolean): FspiopSettings {
    return new FspiopSettings('hub', '', '', '', false, false, ApiType.ISO20022, validateTarget);
}

describe('Iso20022Transformer target validation', () => {

    it('passes options to all 18 calls without changing library shared configuration', async (t) => {
        const forwardConfig = t.mock.method(TransformFacades.FSPIOP, 'configure');
        const reverseConfig = t.mock.method(TransformFacades.FSPIOPISO20022, 'configure');
        const output = {checked: true};
        const methods = [];
        for (const facade of [TransformFacades.FSPIOP, TransformFacades.FSPIOPISO20022]) {
            for (const resource of [facade.quotes, facade.transfers, facade.parties]) {
                for (const method of Object.keys(resource)) {
                    methods.push(t.mock.method(resource, method as keyof typeof resource, async () => ({body: output}), {}));
                }
            }
        }

        let transformer = new Iso20022Transformer(transformerSettings(false));
        const conversions = [
            () => transformer.fspiopPostQuotesToIso({}),
            () => transformer.isoPostQuotesToFspiop({}),
            () => transformer.fspiopPutQuotesToIso('quote-id', {}, {}, {isoPostQuote: {}}),
            () => transformer.isoPutQuotesToFspiop({}),
            () => transformer.fspiopPutQuotesErrorToIso({}),
            () => transformer.isoPutQuotesErrorToFspiop({}),
            () => transformer.fspiopPostTransfersToIso({}, {}, {isoPostQuoteResponse: {}}),
            () => transformer.isoPostTransfersToFspiop({}),
            () => transformer.fspiopPutTransfersToIso({}),
            () => transformer.isoPutTransfersToFspiop({}),
            () => transformer.fspiopPatchTransfersToIso({}),
            () => transformer.isoPatchTransfersToFspiop({}),
            () => transformer.fspiopPutTransfersErrorToIso({}),
            () => transformer.isoPutTransfersErrorToFspiop({}),
            () => transformer.fspiopPutPartiesToIso('MSISDN', '123', undefined, {}, {}),
            () => transformer.isoPutPartiesToFspiop({}),
            () => transformer.fspiopPutPartiesErrorToIso('MSISDN', '123', undefined, {}, {}),
            () => transformer.isoPutPartiesErrorToFspiop({}),
        ];

        for (const validateTarget of [false, true, false]) {
            transformer = new Iso20022Transformer(transformerSettings(validateTarget));
            for (const convert of conversions) {
                assert.equal(await convert(), output);
            }
        }

        assert.equal(methods.length, 18);
        for (const method of methods) {
            assert.deepEqual(method.mock.calls.map((call) => call.arguments[1]), [
                {validateTarget: false},
                {validateTarget: true},
                {validateTarget: false},
            ]);
        }
        assert.equal(forwardConfig.mock.callCount(), 0);
        assert.equal(reverseConfig.mock.callCount(), 0);
    });

    it('keeps settings isolated between Nest module instances', async (t) => {
        const enabled = await Test.createTestingModule({
            controllers: [PartiesController, QuotesController, TransfersController],
            providers: [
                {provide: CommandBus, useValue: {}},
                {provide: FspiopSettings, useValue: transformerSettings(true)},
                Iso20022Transformer,
            ],
        }).compile();
        const disabled = await Test.createTestingModule({
            providers: [
                {provide: FspiopSettings, useValue: transformerSettings(false)},
                Iso20022Transformer,
            ],
        }).compile();
        try {
            for (const Controller of [PartiesController, QuotesController, TransfersController]) {
                assert.ok(enabled.get(Controller));
            }
            const post = t.mock.method(TransformFacades.FSPIOP.quotes, 'post', async () => ({body: {}}));
            await enabled.get(Iso20022Transformer).fspiopPostQuotesToIso({});
            await disabled.get(Iso20022Transformer).fspiopPostQuotesToIso({});
            await enabled.get(Iso20022Transformer).fspiopPostQuotesToIso({});
            assert.deepEqual(post.mock.calls.map((call) => call.arguments[1]), [
                {validateTarget: true},
                {validateTarget: false},
                {validateTarget: true},
            ]);
        } finally {
            await enabled.close();
            await disabled.close();
        }
    });

    for (const [direction, convert] of [
        ['FSPIOP to ISO 20022', (transformer: Iso20022Transformer) => transformer.fspiopPostQuotesToIso({})],
        ['ISO 20022 to FSPIOP', (transformer: Iso20022Transformer) => transformer.isoPostQuotesToFspiop({
            CdtTrfTxInf: {PmtId: {TxId: 'invalid'}},
        })],
    ] as const) {
        it(`rejects an invalid ${direction} output only when enabled`, async () => {
            const disabled = new Iso20022Transformer(transformerSettings(false));
            const enabled = new Iso20022Transformer(transformerSettings(true));
            await assert.doesNotReject(() => convert(disabled));
            await assert.rejects(() => convert(enabled), /Validation errors/);
            await assert.doesNotReject(() => convert(disabled));
        });
    }
});
