import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {Wallet1ConnectorDependencies} from './required.dependencies';

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
                return new Wallet1ConnectorDependencies(configService);
            },
        }),
    ],
})
export class Wallet1ConnectorAppModule {
}
