import * as assert from 'node:assert/strict';
import {after, before, describe, it} from 'node:test';
import {resolve} from 'node:path';
import {CommandBus} from '@nestjs/cqrs';
import {Test, TestingModule} from '@nestjs/testing';
import {Client} from 'pg';
import {PgMigration} from '@shared/pg-migration';
import {DbTarget} from '@shared/typeorm';
import {PartyIdType} from '@shared/fspiop';
import {AuditOutboundPartiesCommand} from '@core/audit/domain';
import {AuditDomainModule} from '@core/audit/domain';
import {OutboundPartiesRepository} from '@core/audit/domain';

const toDbIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const ensureDatabaseExists = async (
    host: string,
    port: string,
    database: string,
    username: string,
    password: string,
): Promise<void> => {
    const adminDatabase = process.env['DB_WRITE_ADMIN_NAME'] ?? 'postgres';
    const client = new Client({
        host,
        port: Number(port),
        database: adminDatabase,
        user: username,
        password,
    });

    await client.connect();
    try {
        const result = await client.query<{exists: boolean}>(
            'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
            [database],
        );
        const exists = result.rows[0]?.exists ?? false;

        if (!exists) {
            await client.query(`CREATE DATABASE ${toDbIdentifier(database)}`);
        }
    } finally {
        await client.end();
    }
};

describe('AuditOutboundPartiesCommand', () => {

    let app: TestingModule;
    let commandBus: CommandBus;
    let repository: OutboundPartiesRepository;

    before(async () => {
        const host = process.env['DB_WRITE_HOST'] ?? 'localhost';
        const port = process.env['DB_WRITE_PORT'] ?? '5432';
        const db = process.env['DB_WRITE_NAME'] ?? 'payport';
        const user = process.env['DB_WRITE_USERNAME'] ?? 'postgres';
        const password = process.env['DB_WRITE_PASSWORD'] ?? 'postgres';
        const schema = process.env['DB_WRITE_SCHEMA'] ?? 'public';
        const locations = [resolve(process.cwd(), 'packages/core/audit/domain/sql')];

        await ensureDatabaseExists(host, port, db, user, password);

        await PgMigration.migrate({
            host,
            port: Number(port),
            username: user,
            password,
            database: db,
            schema,
            locations,
        });

        app = await Test.createTestingModule({
            imports: [AuditDomainModule],
        }).compile();

        await app.init();

        commandBus = app.get(CommandBus);
        repository = app.get(OutboundPartiesRepository);
    });

    after(async () => {
        await app.close();
    });

    it('should save request stage with null response and error', async () => {
        const input = new AuditOutboundPartiesCommand.Input(
            '10001',
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            '100',
            PartyIdType.Msisdn,
            '254712345678',
        );

        const output = await commandBus.execute<AuditOutboundPartiesCommand, AuditOutboundPartiesCommand.Output>(
            new AuditOutboundPartiesCommand(input),
        );

        assert.equal(output.id, '10001');

        const saved = await repository.findById(output.id, DbTarget.Write);

        assert.ok(saved);
        assert.equal(saved.response, null);
        assert.equal(saved.error, null);
        assert.equal(saved.failed, false);
        assert.equal(saved.completedAt, null);
    });

    it('should save success stage with null error', async () => {
        const response = {
            party: {
                partyIdInfo: {
                    partyIdType: 'MSISDN',
                    partyIdentifier: '254712345679',
                    fspId: 'payee-fsp',
                },
            },
        } as any;

        const input = new AuditOutboundPartiesCommand.Input(
            '10002',
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            '101',
            PartyIdType.Msisdn,
            '254712345679',
            undefined,
            response,
            {
                errorInformation: {
                    errorCode: '3201',
                    errorDescription: 'Should be ignored when response exists',
                },
            } as any,
        );

        await commandBus.execute<AuditOutboundPartiesCommand, AuditOutboundPartiesCommand.Output>(
            new AuditOutboundPartiesCommand(input),
        );

        const saved = await repository.findById('10002', DbTarget.Write);

        assert.ok(saved);
        assert.ok(saved.response);
        assert.equal(saved.error, null);
        assert.equal(saved.failed, false);
        assert.ok(saved.completedAt instanceof Date);
    });

    it('should save error stage with failed true', async () => {
        const error = {
            errorInformation: {
                errorCode: '3201',
                errorDescription: 'Destination FSP Error',
            },
        } as any;

        const input = new AuditOutboundPartiesCommand.Input(
            '10003',
            'FSPIOP',
            'payer-fsp',
            'payee-fsp',
            '102',
            PartyIdType.Msisdn,
            '254712345680',
            undefined,
            null,
            error,
        );

        await commandBus.execute<AuditOutboundPartiesCommand, AuditOutboundPartiesCommand.Output>(
            new AuditOutboundPartiesCommand(input),
        );

        const saved = await repository.findById('10003', DbTarget.Write);

        assert.ok(saved);
        assert.equal(saved.response, null);
        assert.ok(saved.error);
        assert.equal(saved.failed, true);
        assert.ok(saved.completedAt instanceof Date);
    });
});
