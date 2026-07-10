// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebOutboundModule} from './web-outbound.module';
import {WebOutboundSettings} from './required.settings';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebOutboundModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebOutboundSettings => {
                return new WebOutboundSettings(configService);
            },
        }),
    ],
})
export class WebOutboundAppModule {
}
