import * as assert from 'node:assert/strict';
import {after, before, describe, it} from 'node:test';
import {Client} from 'pg';
import {NatsClientService} from '@shared/nats';
import {PartyIdType} from '@shared/fspiop';
import {AuditInboundPartiesCommand} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';

// ── unique IDs per test run ───────────────────────────────────────────────────
// Using Date.now() * 10 + sequence avoids duplicate-key conflicts on re-runs.
// A previous run's rows already in the DB won't block the consumer on retry.
const BASE = Date.now();
const ID_1 = String(BASE * 10 + 1);
const ID_2 = String(BASE * 10 + 2);
const ID_3 = String(BASE * 10 + 3);

// ── helper ────────────────────────────────────────────────────────────────────

/**
 * Polls `queryFn` every 200 ms until it returns a defined value.
 * Throws if the timeout (default 15 s) is exceeded — the consumer is not running.
 */
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

// ── test suite ────────────────────────────────────────────────────────────────

describe('InboundPartiesAuditPublisher (integration)', () => {

    let nats: NatsClientService;
    let publisher: InboundPartiesAuditPublisher;
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

        publisher = new InboundPartiesAuditPublisher(nats);

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
            .query<Record<string, unknown>>('SELECT * FROM inbound_parties WHERE id = $1', [id])
            .then(r => r.rows[0]);

    // ── tests ─────────────────────────────────────────────────────────────────

    it('should publish request stage — consumer inserts row with no response, error or fspError', async () => {
        const input = new AuditInboundPartiesCommand.Input(
            ID_1,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_1}`,
            PartyIdType.Msisdn,
            '254712345678',
        );

        await publisher.publish(input);

        const row = await pollForRow(() => findRow(ID_1));

        assert.ok(row, 'Row should be present in DB');
        assert.equal(row['rail'],          'FSPIOP');
        assert.equal(row['payer_fsp'],     'payer-fsp');
        assert.equal(row['payee_fsp'],     'payee-fsp');
        assert.equal(row['party_id'],      '254712345678');
        assert.equal(row['response'],      null);
        assert.equal(row['error'],         null);
        assert.equal(row['fsp_error'],     null);
        assert.equal(row['failed'],        false);
        assert.equal(row['completed_at'],  null);
    });

    it('should publish success stage — consumer inserts row with response and no error', async () => {
        const response = {
            party: {
                partyIdInfo: {
                    partyIdType: 'MSISDN',
                    partyIdentifier: '254712345679',
                    fspId: 'payer-fsp',
                },
            },
        } as any;

        const input = new AuditInboundPartiesCommand.Input(
            ID_2,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_2}`,
            PartyIdType.Msisdn,
            '254712345679',
            undefined,
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
        const input = new AuditInboundPartiesCommand.Input(
            ID_3,
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            `corr-${ID_3}`,
            PartyIdType.Msisdn,
            '254712345680',
            undefined,
            null,
            null,
            'Party not found in FSP registry',
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
