// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/** The field is `publicKey` even though the endpoint is named `jwscerts`. */
export class PostJwsCertRequest {

    @ApiProperty({type: String})
    publicKey!: string;
}

export class JwsCert {

    @ApiProperty({type: String, required: false})
    dfspId?: string;

    @ApiProperty({type: String})
    publicKey!: string;

    /**
     * MCM validates the PEM with node-forge, which is RSA-only. Under RS256
     * (settled decision 3) keys register `VALID`; an EC key would register
     * `INVALID` and nothing downstream would act on it. Do not gate on this —
     * compare the read-back instead.
     */
    @ApiProperty({type: String, required: false})
    validationState?: string;
}
