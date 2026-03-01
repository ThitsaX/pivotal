import * as assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { FlywayMigration } from '@shared/flyway';
import { DbTarget } from '@shared/persistence';
import { PartyIdType } from '@shared/fspiop';
import { AuditDomainModule } from '../../../../../packages/core/audit/domain/domain.module';
import {
    CompleteOutboundPartiesCommand,
    FailOutboundPartiesCommand,
    InitiateOutboundPartiesCommand,
} from '../../../../../packages/core/audit/domain/command';
import {
    OutboundPartiesRequestRepository,
    OutboundPartiesResponseRepository,
} from '../../../../../packages/core/audit/domain/repository';

describe('OutboundParties audit command handlers', () => {

    let app: TestingModule;
    let commandBus: CommandBus;
    let requestRepository: OutboundPartiesRequestRepository;
    let responseRepository: OutboundPartiesResponseRepository;

    before(async () => {
        const host = process.env['DB_WRITE_HOST'] ?? 'localhost';
        const port = process.env['DB_WRITE_PORT'] ?? '5432';
        const db = process.env['DB_WRITE_NAME'] ?? 'audit';
        const user = process.env['DB_WRITE_USERNAME'] ?? 'postgres';
        const password = process.env['DB_WRITE_PASSWORD'] ?? 'postgres';

        const flyway = new FlywayMigration();

        await flyway.migrate({
            config: FlywayMigration.buildConfig({
                url: `jdbc:postgresql://${host}:${port}/${db}`,
                user,
                password,
                migrationLocations: ['classpath:core/audit/domain/sql'],
            }),
        });

        app = await Test.createTestingModule({
            imports: [AuditDomainModule],
        }).compile();

        await app.init();

        commandBus = app.get(CommandBus);
        requestRepository = app.get(OutboundPartiesRequestRepository);
        responseRepository = app.get(OutboundPartiesResponseRepository);
    });

    after(async () => {
        await app.close();
    });

    describe('InitiateOutboundPartiesHandler', () => {

        it('should create a request record and return its id', async () => {
            const input = new InitiateOutboundPartiesCommand.Input(
                '10001',
                'FSPIOP',
                'payer-fsp',
                'payee-fsp',
                100n,
                PartyIdType.Msisdn,
                '254712345678',
            );

            const output = await commandBus.execute<
                InitiateOutboundPartiesCommand,
                InitiateOutboundPartiesCommand.Output
            >(new InitiateOutboundPartiesCommand(input));

            assert.equal(output.id, '10001');

            const saved = await requestRepository.findById(output.id, DbTarget.Write);
            assert.ok(saved, 'expected request record to exist in DB');
            assert.equal(saved.rail, 'FSPIOP');
            assert.equal(saved.payerFsp, 'payer-fsp');
            assert.equal(saved.payeeFsp, 'payee-fsp');
            assert.equal(saved.partyIdType, 'MSISDN');
            assert.equal(saved.partyId, '254712345678');
            assert.equal(saved.subId, null);
            assert.ok(saved.createdAt instanceof Date);

            const response = await responseRepository.findById(output.id, DbTarget.Write);
            assert.equal(response, null);
        });

        it('should create a request record with a subId', async () => {
            const input = new InitiateOutboundPartiesCommand.Input(
                '10002',
                'FSPIOP',
                'payer-fsp',
                'payee-fsp',
                101n,
                PartyIdType.PersonalId,
                'P123456',
                'PASSPORT',
            );

            const output = await commandBus.execute<
                InitiateOutboundPartiesCommand,
                InitiateOutboundPartiesCommand.Output
            >(new InitiateOutboundPartiesCommand(input));

            const saved = await requestRepository.findById(output.id, DbTarget.Write);
            assert.ok(saved);
            assert.equal(saved.partyId, 'P123456');
            assert.equal(saved.subId, 'PASSPORT');
        });
    });

    describe('CompleteOutboundPartiesHandler', () => {

        it('should store response and clear error in response record', async () => {
            const initiated = await commandBus.execute<
                InitiateOutboundPartiesCommand,
                InitiateOutboundPartiesCommand.Output
            >(new InitiateOutboundPartiesCommand(
                new InitiateOutboundPartiesCommand.Input(
                    '20001',
                    'FSPIOP',
                    'payer-fsp',
                    'payee-fsp',
                    200n,
                    PartyIdType.Msisdn,
                    '254712345679',
                ),
            ));

            const mockResponse = {
                party: {
                    partyIdInfo: {
                        partyIdType: 'MSISDN',
                        partyIdentifier: '254712345679',
                        fspId: 'payee-fsp',
                    },
                },
            } as any;

            await commandBus.execute<
                CompleteOutboundPartiesCommand,
                CompleteOutboundPartiesCommand.Output
            >(new CompleteOutboundPartiesCommand(
                new CompleteOutboundPartiesCommand.Input(initiated.id, mockResponse),
            ));

            const completed = await responseRepository.findById(initiated.id, DbTarget.Write);
            assert.ok(completed);
            assert.ok(completed.response, 'expected response to be stored');
            assert.equal(completed.error, null);
            assert.ok(completed.completedAt instanceof Date);
        });

        it('should accept a null response', async () => {
            const initiated = await commandBus.execute<
                InitiateOutboundPartiesCommand,
                InitiateOutboundPartiesCommand.Output
            >(new InitiateOutboundPartiesCommand(
                new InitiateOutboundPartiesCommand.Input(
                    '20002',
                    'FSPIOP',
                    'payer-fsp',
                    'payee-fsp',
                    201n,
                    PartyIdType.Msisdn,
                    '254712345600',
                ),
            ));

            await commandBus.execute<
                CompleteOutboundPartiesCommand,
                CompleteOutboundPartiesCommand.Output
            >(new CompleteOutboundPartiesCommand(
                new CompleteOutboundPartiesCommand.Input(initiated.id, null),
            ));

            const completed = await responseRepository.findById(initiated.id, DbTarget.Write);
            assert.ok(completed);
            assert.equal(completed.response, null);
            assert.ok(completed.completedAt instanceof Date);
        });

        it('should throw when request record is not found', async () => {
            await assert.rejects(
                () => commandBus.execute(new CompleteOutboundPartiesCommand(
                    new CompleteOutboundPartiesCommand.Input('999999999', null),
                )),
                (err: Error) => {
                    assert.ok(err.message.includes('999999999'));
                    return true;
                },
            );
        });
    });

    describe('FailOutboundPartiesHandler', () => {

        it('should store error in response record', async () => {
            const initiated = await commandBus.execute<
                InitiateOutboundPartiesCommand,
                InitiateOutboundPartiesCommand.Output
            >(new InitiateOutboundPartiesCommand(
                new InitiateOutboundPartiesCommand.Input(
                    '30001',
                    'FSPIOP',
                    'payer-fsp',
                    'payee-fsp',
                    300n,
                    PartyIdType.Msisdn,
                    '254712345680',
                ),
            ));

            const mockError = {
                errorInformation: {
                    errorCode: '3201',
                    errorDescription: 'Destination FSP Error',
                },
            } as any;

            await commandBus.execute<
                FailOutboundPartiesCommand,
                FailOutboundPartiesCommand.Output
            >(new FailOutboundPartiesCommand(
                new FailOutboundPartiesCommand.Input(initiated.id, mockError),
            ));

            const failed = await responseRepository.findById(initiated.id, DbTarget.Write);
            assert.ok(failed);
            assert.ok(failed.error, 'expected error to be stored');
            assert.equal(failed.response, null);
            assert.ok(failed.completedAt instanceof Date);
        });

        it('should throw when request record is not found', async () => {
            const mockError = {
                errorInformation: {
                    errorCode: '3201',
                    errorDescription: 'Destination FSP Error',
                },
            } as any;

            await assert.rejects(
                () => commandBus.execute(new FailOutboundPartiesCommand(
                    new FailOutboundPartiesCommand.Input('999999999', mockError),
                )),
                (err: Error) => {
                    assert.ok(err.message.includes('999999999'));
                    return true;
                },
            );
        });
    });
});
