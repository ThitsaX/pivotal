// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'refresh_tokens'})
@Index('refresh_tokens_01_uk_token_hash', ['tokenHash'], {unique: true})
@Index('refresh_tokens_02_idx_user_id', ['userId'])
@Index('refresh_tokens_03_idx_family_id', ['familyId'])
export class RefreshToken {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'bigint', name: 'user_id'})
    public userId: string;

    @Column({type: 'bigint', name: 'family_id'})
    public familyId: string;

    @Column({type: 'varchar', length: 255, name: 'token_hash'})
    public tokenHash: string;

    @Column({type: 'datetime', name: 'expires_at'})
    public expiresAt: Date;

    @Column({type: 'datetime', name: 'revoked_at', nullable: true})
    public revokedAt: Date | null;

    @Column({type: 'bigint', name: 'replaced_by', nullable: true})
    public replacedBy: string | null;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    constructor(
        userId: string,
        familyId: string,
        tokenHash: string,
        expiresAt: Date,
        id?: string,
    ) {
        if (id !== undefined) {
            this.id = id;
        }
        this.userId = userId;
        this.familyId = familyId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.revokedAt = null;
        this.replacedBy = null;
    }

    @BeforeInsert()
    assignId(): void {
        if (this.id == null) {
            this.id = RefreshToken.SNOWFLAKE.nextId().toString();
        }
    }

    public static newFamilyId(): string {
        return RefreshToken.SNOWFLAKE.nextId().toString();
    }
}
