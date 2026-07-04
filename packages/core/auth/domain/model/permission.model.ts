// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';
import {PermissionScope} from './role-scope';

@Entity({name: 'permissions'})
@Index('permissions_01_uk_key_name', ['keyName'], {unique: true})
export class Permission {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 128, name: 'key_name'})
    public keyName: string;

    @Column({type: 'varchar', length: 512, name: 'description', nullable: true})
    public description: string | null;

    @Column({type: 'varchar', length: 8, name: 'scope'})
    public scope: PermissionScope;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    constructor(
        keyName: string,
        scope: PermissionScope,
        description: string | null = null,
        id?: string,
    ) {
        if (id !== undefined) {
            this.id = id;
        }
        this.keyName = keyName;
        this.scope = scope;
        this.description = description;
    }

    @BeforeInsert()
    assignId(): void {
        if (this.id == null) {
            this.id = Permission.SNOWFLAKE.nextId().toString();
        }
    }
}
