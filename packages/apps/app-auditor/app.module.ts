import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {AuditConsumerModule} from '@core/audit/consumer';
import {AuditConsumerSettings} from './required.settings';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        AuditConsumerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): AuditConsumerModule.RequiredSettings => {
                return new AuditConsumerSettings(configService);
            },
        }),
    ],
})
export class AuditConsumerAppModule {
}
