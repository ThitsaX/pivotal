// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/** `CSR_LOADED` -> `CERT_SIGNED`. */
export enum OutboundEnrollmentState {
    CsrLoaded = 'CSR_LOADED',
    CertSigned = 'CERT_SIGNED',
}

/**
 * A client certificate for the **Hub**, to present when it calls a DFSP back.
 *
 * The reverse of an inbound enrollment: MCM generates the key and the CSR on the Hub's behalf, and
 * the DFSP's CA signs it. MCM keeps the private key and returns only the CSR, with an empty subject
 * -- it takes the callback host from the signed certificate's common name instead.
 */
export class OutboundEnrollment {

    @ApiProperty({type: Number})
    id!: number;

    @ApiProperty({type: String})
    state!: OutboundEnrollmentState | string;

    @ApiProperty({type: String, required: false})
    csr?: string;

    /** Present once signed. Issued by the DFSP's CA -- for Pivotal, Pivotal's hub-client CA. */
    @ApiProperty({type: String, required: false})
    certificate?: string;

    @ApiProperty({type: String, required: false})
    validationState?: string;
}
