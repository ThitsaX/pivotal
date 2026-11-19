// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {AddressInfo} from 'node:net';
import {describe, it} from 'node:test';
import {Test} from '@nestjs/testing';
import {APP_GUARD} from '@nestjs/core';
import {CommandBus} from '@nestjs/cqrs';
import {json} from 'express';
import {PartiesController, QuotesController, TransfersController} from '../../../packages/apps/web-inbound/controllers';
import {RepresentationHeaderGuard} from '../../../packages/apps/web-inbound/representation-header.guard';
import {FspiopSettings} from '../../../packages/shared/fspiop/component/fspiop-settings';
import {FspiopExceptionFilter} from '../../../packages/shared/fspiop/component/nest/filter/fspiop-exception.filter';
import {ApiType} from '../../../packages/shared/iso20022/api-type';
import {Iso20022ContentType, Iso20022Resource} from '../../../packages/shared/iso20022/iso20022-content-type';
import {Iso20022Transformer} from '../../../packages/shared/iso20022/iso20022-transformer';

describe('WebInbound HTTP representation validation', () => {
    for (const mode of [ApiType.FSPIOP, ApiType.ISO20022]) {
        it(`rejects unsupported ${mode} headers before conversion or command dispatch`, async () => {
            const commands: unknown[] = [];
            let conversions = 0;
            const converted = {quoteId: 'quote-1', transactionId: 'transfer-1', transferId: 'transfer-1'};
            const transform = async (): Promise<typeof converted> => {
                conversions++;
                return converted;
            };
            const module = await Test.createTestingModule({
                controllers: [PartiesController, QuotesController, TransfersController],
                providers: [
                    {provide: FspiopSettings, useValue: new FspiopSettings('hub', '', '', '', false, false, mode, false)},
                    {provide: CommandBus, useValue: {execute: async (command: unknown): Promise<void> => {commands.push(command);}}},
                    {provide: Iso20022Transformer, useValue: {
                        isoPostQuotesToFspiop: transform,
                        isoPutQuotesToFspiop: transform,
                        isoPostTransfersToFspiop: transform,
                    }},
                    {provide: APP_GUARD, useClass: RepresentationHeaderGuard},
                ],
            }).compile();
            const app = module.createNestApplication({logger: false});
            app.use(json({type: ['application/json', 'application/*+json']}));
            app.useGlobalFilters(new FspiopExceptionFilter());
            await app.listen(0, '127.0.0.1');
            const port = (app.getHttpServer().address() as AddressInfo).port;
            const send = (method: string, path: string, headers: Record<string, string>): Promise<{status: number; body: string}> => new Promise((resolve, reject) => {
                const req = httpRequest({hostname: '127.0.0.1', port, method, path, headers}, res => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => {body += chunk;});
                    res.on('end', () => resolve({status: res.statusCode!, body}));
                });
                req.on('error', reject);
                req.end(method === 'GET' ? undefined : JSON.stringify(converted));
            });
            try {
                const quoteType = Iso20022ContentType.forResource(Iso20022Resource.Quotes, mode);
                for (const contentType of [undefined, 'application/json', 'application/fake-iso20022', quoteType.replace('2.0', '999.0'), quoteType.replace('quotes', 'transfers'), Iso20022ContentType.forResource(Iso20022Resource.Quotes, mode === ApiType.ISO20022 ? ApiType.FSPIOP : ApiType.ISO20022)]) {
                    const headers: Record<string, string> = {accept: quoteType};
                    if (contentType !== undefined) headers['content-type'] = contentType;
                    const result = await send('POST', '/quotes', headers);
                    assert.ok(result.status >= 400 && result.status < 500, result.body);
                    assert.ok(JSON.parse(result.body).errorInformation.errorCode);
                }
                const missingAccept = await send('POST', '/quotes', {'content-type': quoteType});
                assert.equal(JSON.parse(missingAccept.body).errorInformation.errorCode, '3102');
                const invalidCallback = await send('PUT', '/quotes/quote-1', {'content-type': quoteType, accept: 'application/json'});
                assert.equal(JSON.parse(invalidCallback.body).errorInformation.errorCode, '3101');
                assert.equal(commands.length, 0);
                assert.equal(conversions, 0);

                assert.equal((await send('POST', '/quotes', {'content-type': quoteType, accept: quoteType})).status, 202);
                assert.equal((await send('PUT', '/quotes/quote-1', {'content-type': quoteType})).status, 200);
                const transferType = Iso20022ContentType.forResource(Iso20022Resource.Transfers, mode);
                assert.equal((await send('POST', '/transfers', {'content-type': transferType, accept: transferType})).status, 202);
                const partyType = Iso20022ContentType.forResource(Iso20022Resource.Parties, mode);
                assert.equal((await send('GET', '/parties/MSISDN/959123456789', {accept: partyType})).status, 202);
                await new Promise<void>(resolve => setImmediate(resolve));
                assert.equal(commands.length, 4);
                assert.equal(conversions, mode === ApiType.ISO20022 ? 3 : 0);
            } finally {
                await app.close();
            }
        });
    }
});
