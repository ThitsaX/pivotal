// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class PostDfspRequest {

    @ApiProperty({type: String})
    dfspId!: string;

    @ApiProperty({type: String})
    name!: string;

    /**
     * Required only where MCM creates Keycloak accounts for new DFSPs
     * (`KEYCLOAK_ENABLED` with `KEYCLOAK_AUTO_CREATE_ACCOUNTS`): it then validates the
     * address and creates a user for it, and omitting it fails with
     * `ValidationError: email is required`. Otherwise MCM ignores it.
     */
    @ApiProperty({type: String, required: false})
    email?: string;

    @ApiProperty({type: String, required: false})
    monetaryZoneId?: string;
}
