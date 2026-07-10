// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'menus'})
@Index('menus_01_uk_menu_key', ['menuKey'], {unique: true})
@Index('menus_02_idx_parent', ['parentId'])
@Index('menus_03_idx_group_sort', ['groupLabel', 'sortOrder'])
export class Menu {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 64, name: 'menu_key'})
    public menuKey: string;

    @Column({type: 'bigint', name: 'parent_id', nullable: true})
    public parentId: string | null;

    @Column({type: 'varchar', length: 64, name: 'group_label'})
    public groupLabel: string;

    @Column({type: 'varchar', length: 128, name: 'label'})
    public label: string;

    @Column({type: 'varchar', length: 255, name: 'route'})
    public route: string;

    @Column({type: 'varchar', length: 64, name: 'icon', nullable: true})
    public icon: string | null;

    @Column({type: 'int', name: 'sort_order', default: 0})
    public sortOrder: number;

    @Column({type: 'boolean', name: 'is_active', default: true})
    public isActive: boolean;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @Column({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;

    constructor(
        menuKey: string,
        groupLabel: string,
        label: string,
        route: string,
        sortOrder: number = 0,
        icon: string | null = null,
        parentId: string | null = null,
        id?: string,
    ) {
        if (id !== undefined) {
            this.id = id;
        }
        this.menuKey = menuKey;
        this.groupLabel = groupLabel;
        this.label = label;
        this.route = route;
        this.sortOrder = sortOrder;
        this.icon = icon;
        this.parentId = parentId;
        this.isActive = true;
    }

    @BeforeInsert()
    assignId(): void {
        if (this.id == null) {
            this.id = Menu.SNOWFLAKE.nextId().toString();
        }
    }
}
