// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import {AddressInfo} from 'node:net';
import {describe, it} from 'node:test';
import {METHOD_METADATA, PATH_METADATA} from '@nestjs/common/constants';
import {RequestMethod} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {Test} from '@nestjs/testing';
import {Response} from 'express';
import {CurrentFxRateController} from '../../../../packages/apps/web-outbound/controllers/current-fx-rate.controller';
import {IS_SIGNED_GET_KEY} from '../../../../packages/apps/web-outbound/component/signed-transfer-status.decorator';
import {GetCurrentFxRateQuery} from '../../../../packages/core/outbound/domain/query/get-current-fx-rate.query';
import {RawCurrentFxRate} from '../../../../packages/shared/catalyst';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';

const RESPONSE = new RawCurrentFxRate(
    '{"baseCurrency":"USD","quoteCurrency":"LRD","rate":0.0000000001,'
    + '"effectiveFrom":"2026-10-05T00:00:00Z","updatedAt":"2026-10-05T09:00:00Z"}',
);

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

function makeResponse(): {
    response: Response;
    captured: {contentType?: string; body?: unknown};
} {
    const captured: {contentType?: string; body?: unknown} = {};
    const responseLike = {
        type(value: string): unknown {
            captured.contentType = value;
            return responseLike;
        },
        send(value: unknown): unknown {
            captured.body = value;
            return responseLike;
        },
    };

    return {
        response: responseLike as unknown as Response,
        captured,
    };
}

function assertCode(code: string): (error: unknown) => boolean {
    return (error: unknown): boolean => error instanceof FspiopException
        && error.errorDefinition.errorType.code === code;
}

function httpGet(port: number, path: string): Promise<{
    statusCode: number | undefined;
    contentType: string | undefined;
    body: string;
}> {
    return new Promise((resolve, reject) => {
        const request = http.get(
            {
                host: '127.0.0.1',
                port,
                path,
            },
            (response) => {
                response.setEncoding('utf8');
                let body = '';

                response.on('data', (chunk: string) => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve({
                        statusCode: response.statusCode,
                        contentType: response.headers['content-type'],
                        body,
                    });
                });
            },
        );

        request.on('error', reject);
    });
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
        const {response, captured} = makeResponse();

        const result = await controller.get('usd', 'LRD', response);

        assert.equal(result, RESPONSE.body);
        assert.equal(captured.contentType, 'application/json');
        assert.equal(captured.body, undefined);
        assert.equal(result.includes('"rate":0.0000000001'), true);
        assert.equal(queries.length, 1);
        assert.ok(queries[0] instanceof GetCurrentFxRateQuery);
        assert.equal((queries[0] as GetCurrentFxRateQuery).baseCurrency, 'usd');
        assert.equal((queries[0] as GetCurrentFxRateQuery).quoteCurrency, 'LRD');
    });

    it('returns the exact Catalyst JSON number over HTTP without scientific notation', async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [CurrentFxRateController],
            providers: [
                {
                    provide: QueryBus,
                    useValue: {
                        async execute(): Promise<RawCurrentFxRate> {
                            return RESPONSE;
                        },
                    },
                },
            ],
        }).compile();
        const app = moduleRef.createNestApplication();

        await app.listen(0, '127.0.0.1');

        try {
            const address = app.getHttpServer().address() as AddressInfo;
            const result = await httpGet(
                address.port,
                '/secured/rates?baseCurrency=USD&quoteCurrency=LRD',
            );

            assert.equal(result.statusCode, 200);
            assert.match(result.contentType ?? '', /^application\/json\b/);
            assert.equal(result.body, RESPONSE.body);
            assert.equal(result.body.includes('"rate":0.0000000001'), true);
            assert.equal(result.body.includes('1e-10'), false);
            assert.equal(typeof (JSON.parse(result.body) as {rate: unknown}).rate, 'number');
        } finally {
            await app.close();
        }
    });

    it('rejects either missing parameter with the Pivotal missing-element error', async () => {
        const {controller} = makeController();
        const {response} = makeResponse();

        await assert.rejects(
            () => controller.get(undefined, 'LRD', response),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
        await assert.rejects(
            () => controller.get('USD', undefined, response),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
    });

    it('rejects blank or repeated query values as malformed', async () => {
        const {controller} = makeController();
        const {response} = makeResponse();

        await assert.rejects(
            () => controller.get('   ', 'LRD', response),
            assertCode(FspiopErrors.MALFORMED_SYNTAX.errorType.code),
        );
        await assert.rejects(
            () => controller.get(['USD', 'EUR'] as never, 'LRD', response),
            assertCode(FspiopErrors.MALFORMED_SYNTAX.errorType.code),
        );
    });
});
