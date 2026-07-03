// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebInboundSettings} from './required.settings';
import {WebInboundModule} from './web-inbound.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebInboundModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebInboundModule.RequiredSettings => {
                return new WebInboundSettings(configService);
            },
        }),
    ],
})
export class WebInboundAppModule {
}
