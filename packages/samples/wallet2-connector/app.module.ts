import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {Wallet2ConnectorDependencies} from './required.dependencies';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        ConnectorConsumerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): ConnectorConsumerModule.RequiredDependencies => {
                return new Wallet2ConnectorDependencies(configService);
            },
        }),
    ],
})
export class Wallet2ConnectorAppModule {
}
