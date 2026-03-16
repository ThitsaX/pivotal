import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebAuditDependencies} from './required.dependencies';
import {WebAuditModule} from './web-audit.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebAuditModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebAuditModule.RequiredDependencies => {
                return new WebAuditDependencies(configService);
            },
        }),
    ],
})
export class WebAuditAppModule {
}
