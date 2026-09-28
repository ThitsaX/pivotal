// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * The lifecycle states a {@link ParticipantCert} can hold.
 *
 * A table rather than an enumerated type so the set can grow without a schema change, and so the
 * operator views and reporting can read the descriptions without loading application code.
 */
@Entity({name: 'participant_cert_status'})
export class ParticipantCertStatus {

    @PrimaryColumn({type: 'varchar', length: 16, name: 'code'})
    public code!: string;

    @Column({type: 'varchar', length: 255, name: 'description'})
    public description!: string;
}

/**
 * The seeded codes, for the paths that must name one.
 *
 * Deliberately constants rather than an `enum`: the database owns the set, and these are how code
 * refers to the rows it ships with, not a second definition competing with it. A status added later
 * needs no change here unless application logic must branch on it.
 */
export class ParticipantCertStatusCode {

    /** Presented and accepted. */
    static readonly ACTIVE = 'active';

    /** Superseded but still accepted until it expires, so renewal needs no cutover. */
    static readonly RETIRING = 'retiring';

    /** Withdrawn before expiry and never to be accepted again. */
    static readonly REVOKED = 'revoked';

    /** Past `validTo`, retained so a presented certificate resolves to a reason. */
    static readonly EXPIRED = 'expired';
}
