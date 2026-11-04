import * as assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {after, before, describe, it} from 'node:test';
import {Connection, createConnection, createPool, Pool, RowDataPacket} from 'mysql2/promise';
import {Currency, TransferState} from '../../../../../packages/shared/fspiop';
import {Snowflake} from '../../../../../packages/shared/snowflake';
import {TransactionRepository} from '../../../../../packages/core/audit/domain/repository/transaction.repository';

// Like the existing MySQL integration tests, use a unique disposable schema only.
const mysqlUrl = process.env.AUDIT_TEST_MYSQL_URL;
const mysqlSocket = process.env.AUDIT_TEST_MYSQL_SOCKET;

describe('Transaction audit database IDs', {skip: !mysqlUrl && !mysqlSocket}, () => {
    let connection: Connection;
    let pool: Pool;
    let databaseCreated = false;
    let repository: TransactionRepository;
    const database = `audit_id_test_${randomUUID().replace(/-/g, '')}`;
    const legacyQuoteId = '887906513165762560';
    const legacyCompletedId = '887906513165762561';
    const occurredAt = new Date('2026-09-15T21:13:29.246Z');
    const options = {
        ...(mysqlUrl ? {uri: mysqlUrl} : {socketPath: mysqlSocket, user: 'root'}),
        timezone: 'Z',
        supportBigNumbers: true,
        bigNumberStrings: true,
    };

    const migration = (filename: string) => readFile(resolve(
        __dirname, '../../../../../packages/core/audit/domain/sql', filename,
    ), 'utf8');

    before(async () => {
        connection = await createConnection({...options, multipleStatements: true});
        await connection.query(`CREATE DATABASE \`${database}\``);
        databaseCreated = true;
        await connection.query(`USE \`${database}\``);
        for (const file of [
            'V1_0__create_audit_tables.sql',
            'V1_4__add_transaction_export_amount_fields.sql',
            'V1_5__add_home_transaction_id_fields.sql',
            'V1_8__add_amount_type_to_transactions.sql',
            'V1_9__add_dispute_resolved_at_to_transactions.sql',
        ]) {
            await connection.query(await migration(file));
        }
        for (const [id, correlation, payer, payee, amount] of [
            [legacyQuoteId, 'legacy-quote', 'quote-payer', 'quote-payee', '10'],
            [legacyCompletedId, 'legacy-completed', 'completed-payer', 'completed-payee', '100000'],
        ]) {
            await connection.query(
                `INSERT INTO transactions
                    (id, correlation_id, payer_fsp, payee_fsp, quoting_amount, transaction_started_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, correlation, payer, payee, amount, occurredAt, occurredAt, occurredAt],
            );
        }
        await connection.query(await migration('V1_10__generate_transaction_ids_in_database.sql'));

        pool = createPool({...options, database, connectionLimit: 5});
        const adapter = {query: async (sql: string, params: unknown[]) => (await pool.query(sql, params))[0]};
        repository = new TransactionRepository(adapter as never, adapter as never);
    });

    after(async () => {
        if (pool) {
            await pool.end();
        }
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

    const input = (correlationId: string, completed: boolean): TransactionRepository.UpsertInput => ({
        correlationId,
        payerFsp: completed ? 'completed-payer' : 'quote-payer',
        payeeFsp: completed ? 'completed-payee' : 'quote-payee',
        transactionStartedAt: occurredAt,
        quotingCurrency: Currency.Lrd,
        quotingAmount: completed ? 100000 : 10,
        quotesRespondedAt: occurredAt,
        error: false,
    });

    it('preserves legacy IDs without overwriting unrelated transfers', async (context) => {
        const [legacyRows] = await connection.query<RowDataPacket[]>(
            'SELECT id, correlation_id FROM transactions ORDER BY id',
        );
        assert.deepEqual(legacyRows.map((row) => [row.id, row.correlation_id]), [
            [legacyQuoteId, 'legacy-quote'], [legacyCompletedId, 'legacy-completed'],
        ]);

        // Any return to app-generated IDs reproduces the colliding node-ID scenario.
        context.mock.method(Snowflake.get(), 'nextId', () => BigInt(legacyQuoteId));
        const id = await repository.upsert({
            ...input('legacy-completed', true),
            transferState: TransferState.Committed,
            transferCurrency: Currency.Lrd,
            transferAmount: 100000,
            transactionCompletedAt: occurredAt,
            transfersResponse: {transferId: 'legacy-completed', transferState: 'COMMITTED'},
        });
        assert.equal(id, legacyCompletedId);

        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT id, correlation_id, payer_fsp, payee_fsp, quoting_amount,
                    transfer_amount, transfer_state, transaction_completed_at, transfers_response
             FROM transactions WHERE correlation_id IN ('legacy-quote', 'legacy-completed') ORDER BY id`,
        );
        assert.deepEqual(rows.map((row) => [
            row.id, row.correlation_id, row.payer_fsp, row.payee_fsp, row.quoting_amount, row.transfer_amount,
            row.transfer_state,
        ]), [
            [legacyQuoteId, 'legacy-quote', 'quote-payer', 'quote-payee', '10.0000', null, null],
            [legacyCompletedId, 'legacy-completed', 'completed-payer', 'completed-payee', '100000.0000', '100000.0000', 'COMMITTED'],
        ]);
        assert.equal(rows[0].transaction_completed_at, null);
        assert.equal(rows[0].transfers_response, null);

        const newId = await repository.upsert(input('new-quote', false));
        assert.equal(typeof newId, 'string');
        assert.ok(BigInt(newId) > BigInt(legacyCompletedId));
        assert.equal(await repository.upsert(input('new-quote', false)), newId);
    });
});
