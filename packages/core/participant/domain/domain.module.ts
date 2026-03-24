import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {CentralLedgerAxios, CentralLedgerFacade} from '@shared/central-ledger';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    OnboardFspHandler,
    UpsertEndpointHandler,
} from './command';
import {Participant} from './model';
import {ListParticipantsHandler} from './query';
import {
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
    ParticipantRepository,
} from './repository';

const REQUIRED_DEPENDENCIES = Symbol('ParticipantDomainRequiredDependencies');
const Entities = [
    Participant,
];

const Repositories = [
    ParticipantRepository,
];

const CommandHandlers = [
    OnboardFspHandler,
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    UpsertEndpointHandler,
];

const QueryHandlers = [
    ListParticipantsHandler,
];

@Module({})
export class ParticipantDomainModule {

    static forRootAsync(asyncOptions: ParticipantDomainModule.AsyncOptions): DynamicModule {
        return {
            module: ParticipantDomainModule,
            imports: [
                CqrsModule,
                TypeOrmModule.forRootAsync({
                    connectionName: PIVOTAL_DB_WRITE_CONNECTION_NAME,
                    target: DbTarget.Write,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                TypeOrmModule.forRootAsync({
                    connectionName: PIVOTAL_DB_READ_CONNECTION_NAME,
                    target: DbTarget.Read,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_WRITE_CONNECTION_NAME),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_READ_CONNECTION_NAME),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_DEPENDENCIES,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...ParticipantDomainModule.createProviders(),
            ],
            exports: [CqrsModule, ...Repositories],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: CentralLedgerAxios,
                useFactory: (deps: ParticipantDomainModule.RequiredDependencies): CentralLedgerAxios => deps.centralLedgerAxios(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: CentralLedgerFacade,
                useFactory: (centralLedgerAxios: CentralLedgerAxios): CentralLedgerFacade => new CentralLedgerFacade(centralLedgerAxios),
                inject: [CentralLedgerAxios],
            },
            ...Repositories,
            ...CommandHandlers,
            ...QueryHandlers,
        ];
    }
}

export namespace ParticipantDomainModule {

    export interface RequiredDependencies extends TypeOrmModule.RequiredDependencies {
        centralLedgerAxios(): CentralLedgerAxios;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
