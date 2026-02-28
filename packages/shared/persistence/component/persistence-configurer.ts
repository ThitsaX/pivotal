import {TypeOrmModule, TypeOrmModuleOptions} from '@nestjs/typeorm';

export enum DbTarget {
    Read = 'read',
    Write = 'write',
}

type DomainEntities = NonNullable<TypeOrmModuleOptions['entities']>;

export class PersistenceConfigurer {

    static createWriteTypeOrmOptions(entities: DomainEntities): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: process.env.DB_WRITE_HOST ?? 'localhost',
            port: Number(process.env.DB_WRITE_PORT ?? '5432'),
            username: process.env.DB_WRITE_USERNAME ?? 'postgres',
            password: process.env.DB_WRITE_PASSWORD ?? 'postgres',
            database: process.env.DB_WRITE_NAME ?? 'audit',
            schema: process.env.DB_WRITE_SCHEMA ?? 'public',
            entities,
            synchronize: false,
        };
    }

    static createReadTypeOrmOptions(entities: DomainEntities): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: process.env.DB_READ_HOST ?? process.env.DB_WRITE_HOST ?? 'localhost',
            port: Number(process.env.DB_READ_PORT ?? process.env.DB_WRITE_PORT ?? '5432'),
            username: process.env.DB_READ_USERNAME ?? process.env.DB_WRITE_USERNAME ?? 'postgres',
            password: process.env.DB_READ_PASSWORD ?? process.env.DB_WRITE_PASSWORD ?? 'postgres',
            database: process.env.DB_READ_NAME ?? process.env.DB_WRITE_NAME ?? 'audit',
            schema: process.env.DB_READ_SCHEMA ?? process.env.DB_WRITE_SCHEMA ?? 'public',
            entities,
            synchronize: false,
        };
    }

    static createTypeOrmRootModules(
        writeConnectionName: string,
        readConnectionName: string,
        entities: DomainEntities,
    ) {
        return [
            TypeOrmModule.forRootAsync({
                name: writeConnectionName,
                useFactory: () => PersistenceConfigurer.createWriteTypeOrmOptions(entities),
            }),
            TypeOrmModule.forRootAsync({
                name: readConnectionName,
                useFactory: () => PersistenceConfigurer.createReadTypeOrmOptions(entities),
            }),
        ];
    }
}
