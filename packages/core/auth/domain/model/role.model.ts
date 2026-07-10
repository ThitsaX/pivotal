// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';
import {ROLE_SCOPES, RoleScope} from './role-scope';

@Entity({name: 'roles'})
@Index('roles_01_uk_code', ['code'], {unique: true})
export class Role {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 64, name: 'code'})
    public code: string;

    @Column({type: 'varchar', length: 128, name: 'name'})
    public name: string;

    @Column({type: 'varchar', length: 512, name: 'description', nullable: true})
    public description: string | null;

    @Column({type: 'enum', enum: ROLE_SCOPES, name: 'scope'})
    public scope: RoleScope;

    @Column({type: 'boolean', name: 'is_system', default: false})
    public isSystem: boolean;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @Column({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;

    constructor(
        code: string,
        name: string,
        scope: RoleScope,
        description: string | null = null,
        isSystem: boolean = false,
        id?: string,
    ) {
        if (id !== undefined) {
            this.id = id;
        }
        this.code = code;
        this.name = name;
        this.scope = scope;
        this.description = description;
        this.isSystem = isSystem;
    }

    @BeforeInsert()
    assignId(): void {
        if (this.id == null) {
            this.id = Role.SNOWFLAKE.nextId().toString();
        }
    }
}
