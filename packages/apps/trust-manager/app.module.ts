// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TrustDomainModule} from '@core/trust/domain';
import {TrustManagerSettings} from './required.settings';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        TrustDomainModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): TrustDomainModule.RequiredSettings =>
                new TrustManagerSettings(configService),
        }),
    ],
})
export class TrustManagerAppModule {
}
