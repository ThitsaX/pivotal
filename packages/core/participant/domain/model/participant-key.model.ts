// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn} from 'typeorm';

/**
 * JWS identity and policy for one FSPIOP participant.
 *
 * Separate from {@link Participant} because that entity cannot represent a peer: it requires a
 * private key, and a peer has only a public one. web-inbound must verify signatures from peers,
 * from the Hub, and from Pivotal's own tenants — the Hub relays a tenant's request back to us with
 * `fspiop-source` naming that tenant — so all three need a row here.
 */
export enum ParticipantKeyRole {

    /** Pivotal holds the private key and signs as this participant. */
    Self = 'self',

    /** Pivotal holds only the public key and verifies this participant. */
    Peer = 'peer',
}

@Entity({name: 'participant_key'})
@Index('participant_key_01_uk', ['fspId'], {unique: true})
export class ParticipantKey {

    @PrimaryGeneratedColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 128, name: 'fsp_id'})
    public fspId!: string;

    @Column({type: 'varchar', length: 8, name: 'role'})
    public role!: ParticipantKeyRole;

    @Column({type: 'text', name: 'jws_public_key', nullable: true})
    public jwsPublicKey!: string | null;

    @Column({type: 'text', name: 'jws_private_key', nullable: true})
    public jwsPrivateKey!: string | null;

    @Column({type: 'boolean', name: 'jws_sign_enabled', default: false})
    public jwsSignEnabled!: boolean;

    @Column({type: 'varchar', length: 20, name: 'jws_verify_mode', default: 'off'})
    public jwsVerifyMode!: string;

    @CreateDateColumn({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @UpdateDateColumn({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;
}
