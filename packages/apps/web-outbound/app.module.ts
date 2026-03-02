import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebOutboundDependencies} from './required.dependencies';
import {WebOutboundModule} from './web-outbound.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebOutboundModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebOutboundModule.RequiredDependencies => {
                return new WebOutboundDependencies(configService);
            },
        }),
    ],
})
export class WebOutboundAppModule {
}
