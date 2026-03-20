import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebLegacyDependencies} from './required.dependencies';
import {WebLegacyModule} from './web-legacy.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebLegacyModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebLegacyModule.RequiredDependencies => {
                return new WebLegacyDependencies(configService);
            },
        }),
    ],
})
export class WebLegacyAppModule {
}
