// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/** `NEW` -> `CSR_LOADED` -> `CERT_SIGNED`, or `INVALID`. */
export enum InboundEnrollmentState {
    New = 'NEW',
    CsrLoaded = 'CSR_LOADED',
    CertSigned = 'CERT_SIGNED',
    Invalid = 'INVALID',
}

export class InboundEnrollment {

    @ApiProperty({type: Number})
    id!: number;

    @ApiProperty({enum: InboundEnrollmentState, enumName: 'InboundEnrollmentState'})
    state!: InboundEnrollmentState;

    @ApiProperty({type: String, required: false})
    csr?: string;

    /** Present once signed. Issued by the Hub's CA, not Pivotal's. */
    @ApiProperty({type: String, required: false})
    certificate?: string;

    @ApiProperty({type: String, required: false})
    validationState?: string;
}
