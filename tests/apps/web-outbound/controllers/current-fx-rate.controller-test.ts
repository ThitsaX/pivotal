// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {METHOD_METADATA, PATH_METADATA} from '@nestjs/common/constants';
import {RequestMethod} from '@nestjs/common';
import {CurrentFxRateController} from '../../../../packages/apps/web-outbound/controllers/current-fx-rate.controller';
import {IS_SIGNED_GET_KEY} from '../../../../packages/apps/web-outbound/component/signed-transfer-status.decorator';
import {GetCurrentFxRateQuery} from '../../../../packages/core/outbound/domain/query/get-current-fx-rate.query';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';

const RESPONSE = {
    baseCurrency: 'USD',
    quoteCurrency: 'LRD',
    rate: 184,
    effectiveFrom: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T09:00:00Z',
};

function makeController(): {
    controller: CurrentFxRateController;
    queries: unknown[];
} {
    const queries: unknown[] = [];
    const controller = new CurrentFxRateController({
        async execute(query: unknown) {
            queries.push(query);
            return RESPONSE;
        },
    } as never);

    return {controller, queries};
}

function assertCode(code: string): (error: unknown) => boolean {
    return (error: unknown): boolean => error instanceof FspiopException
        && error.errorDefinition.errorType.code === code;
}

describe('CurrentFxRateController', () => {
    it('registers a signed GET /secured/rates route', () => {
        assert.equal(Reflect.getMetadata(PATH_METADATA, CurrentFxRateController), 'secured/rates');
        assert.equal(Reflect.getMetadata(IS_SIGNED_GET_KEY, CurrentFxRateController), true);
        assert.equal(Reflect.getMetadata(PATH_METADATA, CurrentFxRateController.prototype.get), '/');
        assert.equal(Reflect.getMetadata(METHOD_METADATA, CurrentFxRateController.prototype.get), RequestMethod.GET);
    });

    it('passes both currency parameters through unchanged', async () => {
        const {controller, queries} = makeController();

        const result = await controller.get('usd', 'LRD');

        assert.equal(result, RESPONSE);
        assert.equal(queries.length, 1);
        assert.ok(queries[0] instanceof GetCurrentFxRateQuery);
        assert.equal((queries[0] as GetCurrentFxRateQuery).baseCurrency, 'usd');
        assert.equal((queries[0] as GetCurrentFxRateQuery).quoteCurrency, 'LRD');
    });

    it('rejects either missing parameter with the Pivotal missing-element error', async () => {
        const {controller} = makeController();

        await assert.rejects(
            () => controller.get(undefined, 'LRD'),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
        await assert.rejects(
            () => controller.get('USD', undefined),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
    });

    it('rejects blank or repeated query values as malformed', async () => {
        const {controller} = makeController();

        await assert.rejects(
            () => controller.get('   ', 'LRD'),
            assertCode(FspiopErrors.MALFORMED_SYNTAX.errorType.code),
        );
        await assert.rejects(
            () => controller.get(['USD', 'EUR'] as never, 'LRD'),
            assertCode(FspiopErrors.MALFORMED_SYNTAX.errorType.code),
        );
    });
});
