// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/**
 * The **root** certificate, posted unchanged under every tenant Pivotal fronts.
 * MCM applies no uniqueness constraint and no cross-DFSP comparison, which is what
 * makes settled decision 6 — register the CA, not the leaf — workable.
 */
export class PostDfspCaRequest {

    @ApiProperty({type: String})
    rootCertificate!: string;
}
