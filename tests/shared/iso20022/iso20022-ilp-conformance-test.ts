// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {deserializeIlpPrepare, IlpPrepare, serializeIlpPrepare} from 'ilp-packet';
import {QuotesIDPutResponse, QuotesPostRequest, TransfersPostRequest} from '../../../packages/shared/fspiop/dto';
import {FspiopSettings} from '../../../packages/shared/fspiop/component/fspiop-settings';
import {Interledger} from '../../../packages/shared/interledger/component/interledger';
import {ApiType} from '../../../packages/shared/iso20022/api-type';
import {Iso20022Transformer} from '../../../packages/shared/iso20022/iso20022-transformer';

interface ReferenceVector {
    name: string;
    quoteRequest: QuotesPostRequest;
    quoteResponse: QuotesIDPutResponse;
    expected: {
        ilpPacket: string;
        condition: string;
        fulfilment: string;
        packetAmount: string;
        destination: string;
        transactionJson: string;
    };
}

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/sdk-ilpv4-vectors.json'), 'utf8')) as {
    secret: string;
    vectors: ReferenceVector[];
};

const headers = {'fspiop-source': 'wallet1', 'fspiop-destination': 'wallet2'};
const callbackHeaders = {'fspiop-source': 'wallet2', 'fspiop-destination': 'wallet1'};
const conditionOf = (fulfilment: string): string => createHash('sha256')
    .update(Buffer.from(fulfilment, 'base64url')).digest('base64url');
const transactionJsonOf = (packet: IlpPrepare): string => Buffer.from(packet.data.toString('utf8'), 'base64url').toString('utf8');

// SDK IlpV4/IlpBase use an ASCII base64 secret and ASCII base64 transaction JSON
// for HMAC-SHA256. Fixed SDK-generated vectors anchor this independent derivation;
// the tests do not require a sibling checkout, a Hub, or SDK dependencies.
const sdkFulfilmentOf = (packet: IlpPrepare, secret: string): string => createHmac(
    'sha256',
    Buffer.from(Buffer.from(secret, 'utf8').toString('base64'), 'ascii'),
).update(Buffer.from(Buffer.from(transactionJsonOf(packet), 'utf8').toString('base64'), 'ascii')).digest('base64url');

const transformer = (validateTarget: boolean): Iso20022Transformer => new Iso20022Transformer(
    new FspiopSettings('hub', '', '', '', false, false, ApiType.ISO20022, validateTarget),
);

const transferRequest = (vector: ReferenceVector): TransfersPostRequest => ({
    transferId: vector.quoteRequest.transactionId,
    payerFsp: vector.quoteRequest.payer.partyIdInfo.fspId!,
    payeeFsp: vector.quoteRequest.payee.partyIdInfo.fspId!,
    amount: vector.quoteResponse.transferAmount,
    ilpPacket: vector.quoteResponse.ilpPacket,
    condition: vector.quoteResponse.condition,
    expiration: vector.quoteResponse.expiration,
});

interface IsoTransfer {
    CdtTrfTxInf: {
        PmtId: {TxId: string};
        IntrBkSttlmAmt: {Ccy: string; ActiveCurrencyAndAmount: string};
        VrfctnOfTerms: {IlpV4PrepPacket: string};
    };
}

describe('ISO 20022 ILPv4 reference conformance', () => {
    for (const vector of fixture.vectors) {
        describe(vector.name, () => {
            it('matches the pinned SDK packet, currency minor units, condition and fulfilment', () => {
                const packet = Interledger.unwrap(vector.expected.ilpPacket);
                assert.equal(packet.amount, vector.expected.packetAmount);
                assert.equal(packet.destination, vector.expected.destination);
                assert.equal(packet.expiresAt.toISOString(), vector.quoteResponse.expiration);
                assert.equal(transactionJsonOf(packet), vector.expected.transactionJson);
                assert.deepEqual(JSON.parse(transactionJsonOf(packet)), {
                    quoteId: vector.quoteRequest.quoteId,
                    transactionId: vector.quoteRequest.transactionId,
                    transactionType: vector.quoteRequest.transactionType,
                    payer: vector.quoteRequest.payer,
                    payee: vector.quoteRequest.payee,
                    amount: vector.quoteResponse.transferAmount,
                    expiration: vector.quoteResponse.expiration,
                });
                assert.equal(sdkFulfilmentOf(packet, fixture.secret), vector.expected.fulfilment);
                assert.equal(Buffer.from(vector.expected.fulfilment, 'base64url').length, 32);
                assert.equal(conditionOf(vector.expected.fulfilment), vector.expected.condition);
                assert.equal(packet.executionCondition.toString('base64url'), vector.expected.condition);
            });

            for (const validateTarget of [false, true]) {
                it(`preserves SDK ILP through real quote, transfer and fulfilment mappings with validateTarget=${validateTarget}`, async () => {
                    const mapper = transformer(validateTarget);
                    const before = structuredClone(vector);
                    const isoQuoteRequest = await mapper.fspiopPostQuotesToIso(vector.quoteRequest);
                    const isoQuoteResponse = await mapper.fspiopPutQuotesToIso(
                        vector.quoteRequest.quoteId,
                        vector.quoteResponse,
                        callbackHeaders,
                        {isoPostQuote: isoQuoteRequest as Record<string, unknown>},
                    );
                    const quote = await mapper.isoPutQuotesToFspiop(isoQuoteResponse as Record<string, unknown>) as QuotesIDPutResponse;
                    assert.equal(quote.ilpPacket, vector.expected.ilpPacket);
                    assert.equal(quote.condition, vector.expected.condition);

                    const request = {...transferRequest(vector), ilpPacket: quote.ilpPacket, condition: quote.condition};
                    const isoTransfer = await mapper.fspiopPostTransfersToIso(request, headers, {
                        isoPostQuoteResponse: isoQuoteResponse as Record<string, unknown>,
                    }) as IsoTransfer;
                    // Include JSON serialisation as on the actual wire.
                    const wireBody = JSON.parse(JSON.stringify(isoTransfer)) as IsoTransfer;
                    const wirePacket = wireBody.CdtTrfTxInf.VrfctnOfTerms.IlpV4PrepPacket;
                    assert.equal(wirePacket, vector.expected.ilpPacket);
                    const decoded = deserializeIlpPrepare(Buffer.from(wirePacket, 'base64url'));
                    assert.equal(decoded.amount, vector.expected.packetAmount);
                    assert.equal(transactionJsonOf(decoded), vector.expected.transactionJson);
                    assert.equal(sdkFulfilmentOf(decoded, fixture.secret), vector.expected.fulfilment);
                    assert.equal(conditionOf(sdkFulfilmentOf(decoded, fixture.secret)), decoded.executionCondition.toString('base64url'));

                    const hubTransfer = await mapper.isoPostTransfersToFspiop(wireBody as unknown as Record<string, unknown>) as TransfersPostRequest;
                    assert.deepEqual(hubTransfer, request);
                    assert.equal(hubTransfer.condition, vector.expected.condition);
                    assert.equal(wireBody.CdtTrfTxInf.PmtId.TxId, request.transferId);
                    assert.deepEqual(wireBody.CdtTrfTxInf.IntrBkSttlmAmt, {
                        Ccy: request.amount.currency,
                        ActiveCurrencyAndAmount: request.amount.amount,
                    });

                    const fulfilResponse = {
                        fulfilment: vector.expected.fulfilment,
                        completedTimestamp: '2098-12-31T23:59:00.000Z',
                        transferState: 'COMMITTED',
                    };
                    const isoFulfil = await mapper.fspiopPutTransfersToIso(fulfilResponse);
                    const restoredFulfil = await mapper.isoPutTransfersToFspiop(isoFulfil as Record<string, unknown>) as typeof fulfilResponse;
                    assert.deepEqual(restoredFulfil, fulfilResponse);
                    assert.equal(conditionOf(restoredFulfil.fulfilment), hubTransfer.condition);
                    assert.deepEqual(vector, before);
                });
            }

            it('detects transaction-data tampering even when the original packet condition is retained', async () => {
                const decoded = Interledger.unwrap(vector.expected.ilpPacket);
                const transaction = JSON.parse(transactionJsonOf(decoded));
                transaction.amount.amount = '999.99';
                const tampered = {
                    ...decoded,
                    data: Buffer.from(Buffer.from(JSON.stringify(transaction), 'utf8').toString('base64url'), 'utf8'),
                };
                const packet = deserializeIlpPrepare(serializeIlpPrepare(tampered));
                assert.equal(packet.executionCondition.toString('base64url'), vector.expected.condition);
                assert.notEqual(sdkFulfilmentOf(packet, fixture.secret), vector.expected.fulfilment);
                assert.notEqual(conditionOf(sdkFulfilmentOf(packet, fixture.secret)), vector.expected.condition);
            });

            it('detects a changed execution condition after ISO conversion', async () => {
                const decoded = Interledger.unwrap(vector.expected.ilpPacket);
                const changed = serializeIlpPrepare({...decoded, executionCondition: Buffer.alloc(32, 1)}).toString('base64url');
                const mapper = transformer(false);
                const isoQuoteRequest = await mapper.fspiopPostQuotesToIso(vector.quoteRequest);
                const iso = await mapper.fspiopPostTransfersToIso(
                    {...transferRequest(vector), ilpPacket: changed},
                    headers,
                    {isoPostQuoteResponse: isoQuoteRequest as Record<string, unknown>},
                );
                const restored = await mapper.isoPostTransfersToFspiop(iso as Record<string, unknown>) as TransfersPostRequest;
                // The decoder extracts the condition from the ILP packet. It does
                // not validate the fulfilment; these assertions expose the mismatch.
                assert.equal(restored.condition, Buffer.alloc(32, 1).toString('base64url'));
                assert.notEqual(restored.condition, conditionOf(vector.expected.fulfilment));
            });
        });
    }
});
