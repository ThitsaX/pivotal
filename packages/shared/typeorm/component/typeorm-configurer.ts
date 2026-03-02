import {TypeOrmModuleOptions} from '@nestjs/typeorm';
import {TypeOrmSettings} from './typeorm-settings';

export class TypeOrmConfigurer {

    static toTypeOrmOptions(settings: TypeOrmSettings): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: settings.host,
            port: settings.port,
            username: settings.username,
            password: settings.password,
            database: settings.database,
            schema: settings.schema,
            synchronize: false,
            autoLoadEntities: true,
        };
    }
}

export enum DbTarget {
    Read = 'read',
    Write = 'write',
}

