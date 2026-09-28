import * as assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, describe, it} from 'node:test';
import {Connection, createConnection} from 'mysql2/promise';
import {GetDashboardHandler} from '../../../../../packages/core/audit/domain/query/get-dashboard.handler';
import {GetDashboardQuery} from '../../../../../packages/core/audit/domain/query/get-dashboard.query';
import {TransactionRollupRepository} from '../../../../../packages/core/audit/domain/repository/transaction-rollup.repository';

// Opt in with AUDIT_TEST_MYSQL_URL or AUDIT_TEST_MYSQL_SOCKET. The account needs
// CREATE/DROP DATABASE permission; all writes are confined to a unique test schema.
const mysqlUrl = process.env.AUDIT_TEST_MYSQL_URL;
const mysqlSocket = process.env.AUDIT_TEST_MYSQL_SOCKET;

describe('Dashboard range SQL', {skip: !mysqlUrl && !mysqlSocket}, () => {
    let connection: Connection;
    let databaseCreated = false;
    let repository: TransactionRollupRepository;
    let handler: GetDashboardHandler;
    const database = `audit_range_test_${randomUUID().replace(/-/g, '')}`;

    before(async () => {
        connection = await createConnection({
            ...(mysqlUrl ? {uri: mysqlUrl} : {socketPath: mysqlSocket, user: 'root'}),
            timezone: 'Z',
            multipleStatements: true,
        });
        await connection.query(`CREATE DATABASE \`${database}\``);
        databaseCreated = true;
        await connection.query(`USE \`${database}\``);
        for (const file of [
            'V1_0__create_audit_tables.sql',
            'V1_1__add_keyset_indexes.sql',
            'V1_2__create_transaction_hourly_rollup.sql',
            'V1_7__add_use_case_to_transaction_rollup.sql',
        ]) {
            await connection.query(await readFile(resolve(
                __dirname, '../../../../../packages/core/audit/domain/sql', file,
            ), 'utf8'));
        }

        const query = async (sql: string, params?: unknown[]) => (await connection.query(sql, params))[0];
        const adapter = {
            query,
            manager: {
                async transaction(work: (manager: {query: typeof query}) => Promise<void>) {
                    await connection.beginTransaction();
                    try {
                        await work({query});
                        await connection.commit();
                    } catch (error) {
                        await connection.rollback();
                        throw error;
                    }
                },
            },
        };
        repository = new TransactionRollupRepository(adapter as never, adapter as never);
        handler = new GetDashboardHandler(repository);
    });

    after(async () => {
        if (connection) {
            try {
                if (databaseCreated) {
                    await connection.query(`DROP DATABASE \`${database}\``);
                }
            } finally {
                await connection.end();
            }
        }
    });

    const seed = async (transactions: Array<[string, number | null, string?, string?]>): Promise<void> => {
        await connection.query('DELETE FROM transactions');
        await connection.query('DELETE FROM transaction_hourly_rollup');
        for (const [index, [startedAt, latencyMs, payer = 'wallet1', payee = 'wallet2']] of transactions.entries()) {
            await connection.query(
                `INSERT INTO transactions
                    (id, correlation_id, payer_fsp, payee_fsp, transaction_started_at,
                     transaction_completed_at, created_at, updated_at, transfer_state, transfer_currency, transfer_amount)
                 VALUES (?, ?, ?, ?, ?, TIMESTAMPADD(MICROSECOND, ?, ?), ?, ?, 'COMMITTED', 'USD', 1.25)`,
                [index + 1, String(index + 1), payer, payee, startedAt,
                    latencyMs == null ? null : latencyMs * 1000, startedAt, startedAt, startedAt],
            );
        }
        const times = transactions.map(([value]) => Date.parse(`${value.replace(' ', 'T')}Z`));
        await repository.reaggregateWindow(
            new Date(Math.floor(Math.min(...times) / 3_600_000) * 3_600_000),
            new Date((Math.floor(Math.max(...times) / 3_600_000) + 1) * 3_600_000),
        );
    };

    const load = (from: string, to: string, timeZone: string, fspId?: string) => handler.execute(
        new GetDashboardQuery(new GetDashboardQuery.Input(
            fspId ? new GetDashboardQuery.AccessScope(fspId) : undefined,
            new GetDashboardQuery.DateRange(new Date(from), new Date(to)),
            timeZone,
        )),
    );

    const assertDays = (output: GetDashboardQuery.Output, expected: Array<[string, number, number | null]>) => {
        assert.deepEqual(output.dailyTrend, expected.map(([date, count]) => ({date, count, errorCount: 0, disputeCount: 0})));
        assert.deepEqual(output.latencyTrend, expected.map(([date, , avgLatencyMs]) => ({date, avgLatencyMs})));
        assert.equal(output.total, expected.reduce((sum, [, count]) => sum + count, 0));
    };

    const yangonTransactions: Array<[string, number, string?, string?]> = [
        ['2026-09-03 17:29:59.999999', 100], // excluded before the range
        ['2026-09-03 17:30:00.000000', 200],
        ['2026-09-04 17:29:59.999999', 400],
        ['2026-09-04 17:30:00.000000', 800],
        ['2026-09-04 17:45:00.000000', 1600, 'wallet1', 'wallet1'],
        ['2026-09-05 17:29:59.999999', 3200, 'wallet2', 'wallet1'],
        ['2026-09-05 17:30:00.000000', 6400, 'other1', 'other2'], // excluded at the end
    ];

    it('assigns Sep 4–5 Yangon counts and latency to the correct local days', async () => {
        await seed(yangonTransactions);
        const output = await load('2026-09-03T17:30:00Z', '2026-09-05T17:30:00Z', 'Asia/Yangon');
        assertDays(output, [['2026-09-04', 2, 300], ['2026-09-05', 3, 5600 / 3]]);
        assert.equal(output.avgLatencyMs, 1240);
        assert.equal(output.valueByCurrency[0].txnCount, 5);
        assert.equal(output.valueByCurrency[0].totalAmount, '6.2500');
    });

    it('preserves payer-or-payee scope and counts a self-transfer once', async () => {
        await seed(yangonTransactions);
        assertDays(await load('2026-09-03T17:30:00Z', '2026-09-05T17:30:00Z', 'Asia/Yangon', 'wallet1'),
            [['2026-09-04', 2, 300], ['2026-09-05', 3, 5600 / 3]]);
        assertDays(await load('2026-09-03T17:30:00Z', '2026-09-05T17:30:00Z', 'Asia/Yangon', 'wallet2'),
            [['2026-09-04', 2, 300], ['2026-09-05', 2, 2000]]);
    });

    it('splits a sub-hour range at local midnight without losing endpoint precision', async () => {
        await seed(yangonTransactions);
        assertDays(await load('2026-09-04T17:20:00Z', '2026-09-04T17:50:00Z', 'Asia/Yangon'),
            [['2026-09-04', 1, 400], ['2026-09-05', 2, 1200]]);
        assertDays(await load('2026-09-04T17:29:59Z', '2026-09-04T17:30:00Z', 'Asia/Yangon'),
            [['2026-09-04', 1, 400]]);
    });

    for (const {timeZone, from, midnight, beforeMidnight, to} of [
        {timeZone: 'Asia/Kathmandu', from: '2026-09-03T18:15:00Z', midnight: '2026-09-04 18:15:00',
            beforeMidnight: '2026-09-04 18:14:59.999999', to: '2026-09-05T18:15:00Z'},
        {timeZone: 'America/St_Johns', from: '2026-09-04T02:30:00Z', midnight: '2026-09-05 02:30:00',
            beforeMidnight: '2026-09-05 02:29:59.999999', to: '2026-09-06T02:30:00Z'},
    ]) {
        it(`handles local midnight in ${timeZone}`, async () => {
            await seed([[beforeMidnight, 100], [midnight, 900]]);
            assertDays(await load(from, to, timeZone), [['2026-09-04', 1, 100], ['2026-09-05', 1, 900]]);
        });
    }

    it('resolves each midnight using the offset on that date across a DST change', async () => {
        await seed([
            ['2026-10-03 13:29:59.999999', 100],
            ['2026-10-03 13:30:00.000000', 900],
            ['2026-10-04 12:59:59.999999', 1100],
            ['2026-10-04 13:00:00.000000', 10000], // end: midnight after the +30 minute DST change
        ]);
        assertDays(await load('2026-10-02T13:30:00Z', '2026-10-04T13:00:00Z', 'Australia/Lord_Howe'),
            [['2026-10-03', 1, 100], ['2026-10-04', 2, 1000]]);
    });

    it('keeps UTC-aligned ranges correct and empty days explicit', async () => {
        await seed(yangonTransactions);
        assertDays(await load('2026-09-04T00:00:00Z', '2026-09-05T00:00:00Z', 'UTC'),
            [['2026-09-04', 3, 2800 / 3]]);
        assertDays(await load('2026-09-06T17:30:00Z', '2026-09-08T17:30:00Z', 'Asia/Yangon'),
            [['2026-09-07', 0, null], ['2026-09-08', 0, null]]);
    });

    it('excludes incomplete transactions from the daily latency denominator', async () => {
        await seed([['2026-09-04 17:29:59.999999', null], ['2026-09-04 17:30:00', 500],
            ['2026-09-04 17:45:00', null]]);
        const output = await load('2026-09-03T17:30:00Z', '2026-09-05T17:30:00Z', 'Asia/Yangon');
        assertDays(output, [['2026-09-04', 1, null], ['2026-09-05', 2, 500]]);
        assert.equal(output.avgLatencyMs, 500);
    });
});
