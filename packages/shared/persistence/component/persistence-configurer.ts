import {TypeOrmModule, TypeOrmModuleOptions} from '@nestjs/typeorm';

export enum MtpaDbTarget {
    Read = 'read',
    Write = 'write',
}

type MtpaEntities = NonNullable<TypeOrmModuleOptions['entities']>;

export class PersistenceConfigurer {

    static createWriteTypeOrmOptions(entities: MtpaEntities): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: process.env.MTPA_DB_WRITE_HOST ?? 'localhost',
            port: Number(process.env.MTPA_DB_WRITE_PORT ?? '5432'),
            username: process.env.MTPA_DB_WRITE_USERNAME ?? 'postgres',
            password: process.env.MTPA_DB_WRITE_PASSWORD ?? 'postgres',
            database: process.env.MTPA_DB_WRITE_NAME ?? 'mtpa_audit',
            entities,
            synchronize: false,
        };
    }

    static createReadTypeOrmOptions(entities: MtpaEntities): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            host: process.env.MTPA_DB_READ_HOST ?? process.env.MTPA_DB_WRITE_HOST ?? 'localhost',
            port: Number(process.env.MTPA_DB_READ_PORT ?? process.env.MTPA_DB_WRITE_PORT ?? '5432'),
            username: process.env.MTPA_DB_READ_USERNAME ?? process.env.MTPA_DB_WRITE_USERNAME ?? 'postgres',
            password: process.env.MTPA_DB_READ_PASSWORD ?? process.env.MTPA_DB_WRITE_PASSWORD ?? 'postgres',
            database: process.env.MTPA_DB_READ_NAME ?? process.env.MTPA_DB_WRITE_NAME ?? 'mtpa_audit',
            entities,
            synchronize: false,
        };
    }

    static createTypeOrmRootModules(
        writeConnectionName: string,
        readConnectionName: string,
        entities: MtpaEntities,
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
