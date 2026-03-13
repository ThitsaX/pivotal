import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {
    CatalystAxios,
    CatalystFeeCalculator,
    CatalystFeeEngine,
    EngineMode,
} from '@shared/catalyst';
import {Wallet2ConnectorDependencies} from './required.dependencies';

const DEFAULT_CATALYST_URL = 'http://localhost:4000';
const DEFAULT_CATALYST_ENGINE_MODE = EngineMode.Strict;

const resolveEngineMode = (value: string | undefined): EngineMode => {
    const normalized = (value ?? '').trim().toUpperCase();

    if (normalized === EngineMode.Bypass) {
        return EngineMode.Bypass;
    }

    return DEFAULT_CATALYST_ENGINE_MODE;
};

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
                const catalystUrl = configService.get<string>('CATALYST_URL') ?? DEFAULT_CATALYST_URL;
                const catalystAxios = new CatalystAxios(catalystUrl);
                const feeCalculator = new CatalystFeeCalculator(catalystAxios);
                const engineMode = resolveEngineMode(configService.get<string>('CATALYST_ENGINE_MODE'));
                const catalystFeeEngine = new CatalystFeeEngine(feeCalculator, engineMode);

                return new Wallet2ConnectorDependencies(configService, catalystFeeEngine);
            },
        }),
    ],
})
export class Wallet2ConnectorAppModule {
}
