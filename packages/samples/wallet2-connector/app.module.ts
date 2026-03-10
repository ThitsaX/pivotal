import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {InboundConnectorModule} from '@core/inbound/connector';
import {Wallet2ConnectorDependencies} from './required.dependencies';

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
                return new Wallet2ConnectorDependencies(configService);
            },
        }),
    ],
})
export class Wallet2ConnectorAppModule {
}
