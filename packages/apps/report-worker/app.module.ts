import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {AuditDomainModule} from '@core/audit/domain';
import {ReportWorkerSettings} from './required.settings';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        AuditDomainModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): AuditDomainModule.RequiredSettings => {
                return new ReportWorkerSettings(configService);
            },
        }),
    ],
})
export class ReportWorkerAppModule {
}
