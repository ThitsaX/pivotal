import * as assert from 'node:assert/strict';
import {after, before, describe, it} from 'node:test';
import {Client} from 'pg';
import {NatsClientService} from '@shared/nats';
import {AuditInboundQuotesCommand} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';

// ── unique IDs per test run ───────────────────────────────────────────────────
const BASE = Date.now();
const ID_1 = String(BASE * 10 + 1);
const ID_2 = String(BASE * 10 + 2);
const ID_3 = String(BASE * 10 + 3);

// ── helper ────────────────────────────────────────────────────────────────────

const pollForRow = async <T>(
    queryFn: () => Promise<T | undefined>,
    timeoutMs = 15_000,
): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await queryFn();
        if (result !== undefined) return result;
        await new Promise(r => setTimeout(r, 10));
    }
    throw new Error('Timed out waiting for row — is the audit consumer running?');
};

// Minimal QuotesPostRequest shape for test data.
const makeQuoteRequest = (quoteId: string) => ({
    quoteId,
    transactionId: `txn-${quoteId}`,
    payee: {partyIdInfo: {partyIdType: 'MSISDN', partyIdentifier: '254712345678'}},
    payer: {partyIdInfo: {partyIdType: 'MSISDN', partyIdentifier: '254787654321'}},
    amountType: 'SEND',
    amount: {amount: '100', currency: 'KES'},
    transactionType: {scenario: 'TRANSFER', initiator: 'PAYER', initiatorType: 'CONSUMER'},
} as any);

// ── test suite ────────────────────────────────────────────────────────────────

describe('InboundQuotesAuditPublisher (integration)', () => {

    let nats: NatsClientService;
    let publisher: InboundQuotesAuditPublisher;
    let db: Client;

    before(async () => {
        const natsUrl  = process.env['NATS_URL']           ?? 'nats://localhost:4222';
        const host     = process.env['DB_WRITE_HOST']      ?? 'localhost';
        const port     = Number(process.env['DB_WRITE_PORT']     ?? 5432);
        const database = process.env['DB_WRITE_NAME']      ?? 'payport';
        const user     = process.env['DB_WRITE_USERNAME']  ?? 'postgres';
        const password = process.env['DB_WRITE_PASSWORD']  ?? 'postgres';

        nats = new NatsClientService(natsUrl);
        await nats.onModuleInit();

        publisher = new InboundQuotesAuditPublisher(nats);

        db = new Client({host, port, database, user, password});
        await db.connect();
    });

    after(async () => {
        await nats.onModuleDestroy();
        await db.end();
    });

    // ── helpers ───────────────────────────────────────────────────────────────

    const findRow = (id: string) =>
        db
            .query<Record<string, unknown>>('SELECT * FROM inbound_quotes WHERE id = $1', [id])
            .then(r => r.rows[0]);

    // ── tests ─────────────────────────────────────────────────────────────────

    it('should publish request stage — consumer inserts row with no response, error or fspError', async () => {
        const input = new AuditInboundQuotesCommand.Input(
            ID_1,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_1}`,
            `quote-${ID_1}`,
            makeQuoteRequest(`quote-${ID_1}`),
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_1));

        assert.ok(row, 'Row should be present in DB');
        assert.equal(row['rail'],          'FSPIOP');
        assert.equal(row['payer_fsp'],     'payer-fsp');
        assert.equal(row['payee_fsp'],     'payee-fsp');
        assert.ok(row['request'],          'Request payload should be stored');
        assert.equal(row['response'],      null);
        assert.equal(row['error'],         null);
        assert.equal(row['fsp_error'],     null);
        assert.equal(row['failed'],        false);
        assert.equal(row['completed_at'],  null);
    });

    it('should publish success stage — consumer inserts row with response and no error', async () => {
        const response = {
            transferAmount: {amount: '100', currency: 'KES'},
            expiration: new Date().toISOString(),
            ilpPacket: 'AQAAAAAAAADIEHByaXZhdGUuYm9iL...',
            condition: 'HOr22-H3AfTDHrSkPjJtVPRdKouuMkDpbHjTAycE4Hc',
        } as any;

        const input = new AuditInboundQuotesCommand.Input(
            ID_2,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_2}`,
            `quote-${ID_2}`,
            makeQuoteRequest(`quote-${ID_2}`),
            response,
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_2));

        assert.ok(row);
        assert.ok(row['response'],        'Response should be stored');
        assert.equal(row['error'],        null);
        assert.equal(row['fsp_error'],    null);
        assert.equal(row['failed'],       false);
        assert.ok(row['completed_at'],    'completed_at should be set for success stage');
    });

    it('should publish fspError stage — consumer inserts row with fsp_error and failed=true', async () => {
        const input = new AuditInboundQuotesCommand.Input(
            ID_3,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_3}`,
            `quote-${ID_3}`,
            makeQuoteRequest(`quote-${ID_3}`),
            null,
            null,
            'Quote rejected by FSP — insufficient liquidity',
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_3));

        assert.ok(row);
        assert.equal(row['response'],     null);
        assert.equal(row['error'],        null);
        assert.ok(row['fsp_error'],       'fsp_error should be stored');
        assert.equal(row['failed'],       true);
        assert.ok(row['completed_at'],    'completed_at should be set for fspError stage');
    });
});
