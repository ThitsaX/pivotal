import * as assert from 'node:assert/strict';
import {after, before, describe, it} from 'node:test';
import {Client} from 'pg';
import {NatsClientService} from '@shared/nats';
import {AuditOutboundTransfersCommand} from '@core/audit/domain';
import {OutboundTransfersAuditPublisher} from '@core/audit/producer';

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

// Minimal TransfersPostRequest shape for test data.
const makeTransferRequest = (transferId: string) => ({
    transferId,
    payerFsp: 'payer-fsp',
    payeeFsp: 'payee-fsp',
    amount: {amount: '100', currency: 'KES'},
    ilpPacket: 'AQAAAAAAAADIEHByaXZhdGUuYm9iL...',
    condition: 'HOr22-H3AfTDHrSkPjJtVPRdKouuMkDpbHjTAycE4Hc',
    expiration: new Date(Date.now() + 30_000).toISOString(),
} as any);

// ── test suite ────────────────────────────────────────────────────────────────

describe('OutboundTransfersAuditPublisher (integration)', () => {

    let nats: NatsClientService;
    let publisher: OutboundTransfersAuditPublisher;
    let db: Client;

    before(async () => {
        const natsUrl = process.env['NATS_URL'] ?? 'nats://localhost:4222';
        const host = process.env['DB_WRITE_HOST'] ?? 'localhost';
        const port = Number(process.env['DB_WRITE_PORT'] ?? 5432);
        const database = process.env['DB_WRITE_NAME'] ?? 'payport';
        const user = process.env['DB_WRITE_USERNAME'] ?? 'postgres';
        const password = process.env['DB_WRITE_PASSWORD'] ?? 'postgres';

        nats = new NatsClientService(natsUrl);
        await nats.onModuleInit();

        publisher = new OutboundTransfersAuditPublisher(nats);

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
            .query<Record<string, unknown>>('SELECT * FROM outbound_transfers WHERE id = $1', [id])
            .then(r => r.rows[0]);

    // ── tests ─────────────────────────────────────────────────────────────────

    it('should publish request stage — consumer inserts row with no response or error', async () => {
        const input = new AuditOutboundTransfersCommand.Input(
            ID_1,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_1}`,
            `transfer-${ID_1}`,
            makeTransferRequest(`transfer-${ID_1}`),
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_1));

        assert.ok(row, 'Row should be present in DB');
        assert.equal(row['rail'], 'FSPIOP');
        assert.equal(row['payer_fsp'], 'payer-fsp');
        assert.equal(row['payee_fsp'], 'payee-fsp');
        assert.ok(row['request'], 'Request payload should be stored');
        assert.equal(row['response'], null);
        assert.equal(row['error'], null);
        assert.equal(row['failed'], false);
        assert.equal(row['completed_at'], null);
    });

    it('should publish success stage — consumer inserts row with response and no error', async () => {
        const response = {
            fulfilment: 'mhPUT9ZAA0',
            completedTimestamp: new Date().toISOString(),
            transferState: 'COMMITTED',
        } as any;

        const input = new AuditOutboundTransfersCommand.Input(
            ID_2,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_2}`,
            `transfer-${ID_2}`,
            makeTransferRequest(`transfer-${ID_2}`),
            response,
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_2));

        assert.ok(row);
        assert.ok(row['response'], 'Response should be stored');
        assert.equal(row['error'], null);
        assert.equal(row['failed'], false);
        assert.ok(row['completed_at'], 'completed_at should be set for success stage');
    });

    it('should publish error stage — consumer inserts row with error and failed=true', async () => {
        const error = {
            errorInformation: {
                errorCode: '5104',
                errorDescription: 'Payee FSP rejected the transfer',
            },
        } as any;

        const input = new AuditOutboundTransfersCommand.Input(
            ID_3,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_3}`,
            `transfer-${ID_3}`,
            makeTransferRequest(`transfer-${ID_3}`),
            null,
            error,
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_3));

        assert.ok(row);
        assert.equal(row['response'], null);
        assert.ok(row['error'], 'Error should be stored');
        assert.equal(row['failed'], true);
        assert.ok(row['completed_at'], 'completed_at should be set for error stage');
    });
});
