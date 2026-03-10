import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {InboundConnectorModule} from '@core/inbound/connector';
import {Wallet1ConnectorDependencies} from './required.dependencies';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        InboundConnectorModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): InboundConnectorModule.RequiredDependencies => {
                return new Wallet1ConnectorDependencies(configService);
            },
        }),
    ],
})
export class Wallet1ConnectorAppModule {
}
