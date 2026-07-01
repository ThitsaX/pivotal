import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {CentralLedgerAxios, CentralLedgerAxiosParams, CentralLedgerFacade} from '@shared/central-ledger';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    OnboardFspHandler,
    UpdateAccessKeyHandler,
    UpsertEndpointHandler,
} from './command';
import {Participant} from './model';
import {ListCentralLedgerParticipantsHandler} from './query';
import {ParticipantRepository, PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME,} from './repository';
import {ParticipantSigningKeysCache} from "@core/participant/domain/component/store/participant-signing-keys-cache";

const REQUIRED_SETTINGS = Symbol('ParticipantDomainRequiredSettings');

const Entities = [
    Participant,
];

const Repositories = [
    ParticipantRepository,
];

const Components = [
    ParticipantSigningKeysCache,
];

const CommandHandlers = [
    OnboardFspHandler,
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    UpsertEndpointHandler,
    UpdateAccessKeyHandler,
];

const QueryHandlers = [
    ListCentralLedgerParticipantsHandler,
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
                    provide: REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...ParticipantDomainModule.createProviders(),
            ],
            exports: [
                CqrsModule,
                ...Components
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: CentralLedgerAxios,
                useFactory: (settings: ParticipantDomainModule.RequiredSettings): CentralLedgerAxios => new CentralLedgerAxios(
                    settings.centralLedgerUrl(), settings.centralLedgerAxiosParams()),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: CentralLedgerFacade,
                useFactory: (centralLedgerAxios: CentralLedgerAxios): CentralLedgerFacade => new CentralLedgerFacade(centralLedgerAxios),
                inject: [CentralLedgerAxios],
            },
            ...Repositories,
            ...Components,
            ...CommandHandlers,
            ...QueryHandlers,
        ];
    }
}

export namespace ParticipantDomainModule {

    export interface RequiredSettings extends TypeOrmModule.RequiredSettings {

        centralLedgerUrl(): string;

        centralLedgerAxiosParams(): CentralLedgerAxiosParams
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
