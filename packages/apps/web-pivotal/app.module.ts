// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebPivotalSettings} from './required.settings';
import {WebPivotalModule} from './web-pivotal.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebPivotalModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebPivotalModule.RequiredSettings => {
                return new WebPivotalSettings(configService);
            },
        }),
    ],
})
export class WebPivotalAppModule {
}
