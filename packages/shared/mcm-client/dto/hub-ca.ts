// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class HubCa {

    @ApiProperty({type: String})
    rootCertificate!: string;

    @ApiProperty({type: String, required: false})
    intermediateChain?: string;

    @ApiProperty({type: String, required: false})
    validationState?: string;
}
