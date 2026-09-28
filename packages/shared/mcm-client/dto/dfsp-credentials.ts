// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/**
 * Retrieved with **GET**, never POST: `POST` calls Keycloak's
 * `generateNewClientSecret` and invalidates the existing secret immediately, with
 * no dual-secret grace period.
 */
export class DfspCredentials {

    @ApiProperty({type: String})
    clientId!: string;

    @ApiProperty({type: String})
    clientSecret!: string;
}
