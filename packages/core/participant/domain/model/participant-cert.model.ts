// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn} from 'typeorm';

/**
 * A client certificate Pivotal issued to a DFSP for the DFSP-facing leg.
 *
 * The row is the record of issuance rather than a cache of one: Vault's issuing role runs with
 * `no_store=true`, so nothing upstream keeps a copy. A missing row does not stop a certificate
 * working — it makes it unaccountable, which is why a row is retired by status and never deleted
 * before its `validTo` passes. A revoked certificate whose row has been purged degrades from a
 * known revocation into a lookup miss, and those are different answers.
 *
 * `fspId` is the binding target: a request is rejected unless the certificate presented and the
 * `FSPIOP-Source` header name the same DFSP.
 */
@Entity({name: 'participant_cert'})
@Index('participant_cert_01_uk', ['fingerprintSha256'], {unique: true})
@Index('participant_cert_01_ix', ['fspId', 'status'])
export class ParticipantCert {

    @PrimaryGeneratedColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 128, name: 'fsp_id'})
    public fspId!: string;

    /** The runtime lookup key: what a presented certificate is resolved by. */
    @Column({type: 'char', length: 64, name: 'fingerprint_sha256'})
    public fingerprintSha256!: string;

    @Column({type: 'varchar', length: 128, name: 'serial'})
    public serial!: string;

    /** Set by Pivotal at issuance, never taken from the submitted request. */
    @Column({type: 'varchar', length: 512, name: 'subject'})
    public subject!: string;

    @Column({type: 'text', name: 'cert_pem'})
    public certPem!: string;

    @Column({type: 'text', name: 'ca_chain_pem', nullable: true})
    public caChainPem!: string | null;

    /**
     * A code from `participant_cert_status`, not an enumerated type.
     *
     * The lifecycle gains states as revocation and renewal policy settle, and operator and
     * reporting tooling reads it without loading application code.
     */
    @Column({type: 'varchar', length: 16, name: 'status'})
    public status!: string;

    @Column({type: 'datetime', name: 'valid_from'})
    public validFrom!: Date;

    @Column({type: 'datetime', name: 'valid_to'})
    public validTo!: Date;

    @Column({type: 'datetime', name: 'issued_at'})
    public issuedAt!: Date;

    @Column({type: 'datetime', name: 'revoked_at', nullable: true})
    public revokedAt!: Date | null;

    /** Why this enrollment happened, in the operator's words. */
    @Column({type: 'varchar', length: 512, name: 'note', nullable: true})
    public note!: string | null;

    @CreateDateColumn({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @UpdateDateColumn({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;
}
