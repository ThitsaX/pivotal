// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Module, Provider} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {
    CatalystAxios,
    CatalystFeeCalculator,
    CatalystFeeEngine,
    EngineMode,
} from '@shared/catalyst';
import {Wallet3ConnectorSettings} from './required.settings';
import {Wallet3FspClient} from './wallet3-fsp-client';

const DEFAULT_CATALYST_URL = 'http://localhost:4000';
const DEFAULT_CATALYST_ENGINE_MODE = EngineMode.Strict;

const resolveEngineMode = (value: string | undefined): EngineMode => {
    const normalized = (value ?? '').trim().toUpperCase();

    if (normalized === EngineMode.Bypass) {
        return EngineMode.Bypass;
    }

    return DEFAULT_CATALYST_ENGINE_MODE;
};

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        ConnectorConsumerModule.forRootAsync({
            imports: [ConfigModule],
            providers: Wallet3ConnectorAppModule.createProviders(),
            inject: [ConfigService],
            useFactory: (configService: ConfigService): ConnectorConsumerModule.RequiredSettings => new Wallet3ConnectorSettings(configService),
        }),
    ],
})
export class Wallet3ConnectorAppModule {

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspClient,
                useFactory: (configService: ConfigService, connectorSettings: ConnectorSettings): FspClient => {
                    const catalystUrl = configService.get<string>('CATALYST_URL') ?? DEFAULT_CATALYST_URL;
                    const catalystAxios = new CatalystAxios(catalystUrl);
                    const feeCalculator = new CatalystFeeCalculator(catalystAxios);
                    const engineMode = resolveEngineMode(configService.get<string>('CATALYST_ENGINE_MODE'));
                    const catalystFeeEngine = new CatalystFeeEngine(feeCalculator, engineMode);

                    return new Wallet3FspClient(connectorSettings, catalystFeeEngine);
                },
                inject: [ConfigService, ConnectorSettings],
            },
        ];
    }
}
