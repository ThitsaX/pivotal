import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebInboundDependencies} from './required.dependencies';
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
            useFactory: (configService: ConfigService): WebInboundModule.RequiredDependencies => {
                return new WebInboundDependencies(configService);
            },
        }),
    ],
})
export class WebInboundAppModule {
}
