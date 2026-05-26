import {DynamicModule, Module, Provider} from '@nestjs/common';
import {APP_GUARD} from '@nestjs/core';
import {AuditDomainModule} from '@core/audit/domain';
import {AuthDomainModule} from '@core/auth/domain';
import {ParticipantDomainModule} from '@core/participant/domain';
import {
    AddFspCurrencyController,
    AddHubCurrencyController,
    AddHubSigningKeysController,
    AddSigningKeysController,
    AuthController,
    GenerateSigningKeyController,
    HealthController,
    ListCentralLedgerParticipantsController,
    MeController,
    MenusAdminController,
    OnboardFspController,
    PermissionsAdminController,
    RolePresetsAdminController,
    RolesAdminController,
    TransactionsAuditController,
    UpsertEndpointController,
    UsersAdminController,
} from './controllers';
import {JwtAuthGuard, PermissionsGuard} from './guards';
import {WebPivotalSettings} from './required.settings';

const REQUIRED_SETTINGS = Symbol('WebPivotalRequiredSettings');

@Module({})
export class WebPivotalModule {

    static forRoot(): DynamicModule {
        return WebPivotalModule.forRootAsync({
                                                 useFactory: (): WebPivotalModule.RequiredSettings => new WebPivotalSettings(),
                                             });
    }

    static forRootAsync(asyncOptions: WebPivotalModule.AsyncOptions): DynamicModule {
        return {
            module: WebPivotalModule,
            imports: [
                AuditDomainModule.forRootAsync({
                                                   imports: asyncOptions.imports ?? [],
                                                   inject: asyncOptions.inject ?? [],
                                                   useFactory: asyncOptions.useFactory,
                                               }),
                AuthDomainModule.forRootAsync({
                                                  imports: asyncOptions.imports ?? [],
                                                  inject: asyncOptions.inject ?? [],
                                                  useFactory: asyncOptions.useFactory,
                                              }),
                ParticipantDomainModule.forRootAsync({
                                                         imports: asyncOptions.imports ?? [],
                                                         inject: asyncOptions.inject ?? [],
                                                         useFactory: asyncOptions.useFactory,
                                                     }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                AuthController,
                MeController,
                HealthController,
                OnboardFspController,
                AddFspCurrencyController,
                AddHubCurrencyController,
                AddHubSigningKeysController,
                AddSigningKeysController,
                ListCentralLedgerParticipantsController,
                UpsertEndpointController,
                GenerateSigningKeyController,
                TransactionsAuditController,
                UsersAdminController,
                RolesAdminController,
                RolePresetsAdminController,
                PermissionsAdminController,
                MenusAdminController,
            ],
            providers: [
                JwtAuthGuard,
                PermissionsGuard,
                {
                    provide:  APP_GUARD,
                    useClass: JwtAuthGuard,
                },
                {
                    provide:  APP_GUARD,
                    useClass: PermissionsGuard,
                },
                ...WebPivotalModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebPivotalModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_SETTINGS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
        ];
    }
}

export namespace WebPivotalModule {

    export interface RequiredSettings
        extends AuditDomainModule.RequiredSettings,
            AuthDomainModule.RequiredSettings,
            ParticipantDomainModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
