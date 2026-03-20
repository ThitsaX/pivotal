import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {WebPivotalDependencies} from './required.dependencies';
import {WebPivotalModule} from './web-pivotal.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
        }),
        WebPivotalModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService): WebPivotalModule.RequiredDependencies => {
                return new WebPivotalDependencies(configService);
            },
        }),
    ],
})
export class WebPivotalAppModule {
}
