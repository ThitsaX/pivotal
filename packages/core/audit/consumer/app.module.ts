import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {AuditConsumerModule} from './consumer.module';
import {AuditConsumerDependencies} from './required.dependencies';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        AuditConsumerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): AuditConsumerModule.RequiredDependencies => {
                return new AuditConsumerDependencies(configService);
            },
        }),
    ],
})
export class AuditConsumerAppModule {
}
