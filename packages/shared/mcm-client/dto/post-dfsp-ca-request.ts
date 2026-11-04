// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

/**
 * The **root** certificate, posted unchanged under every tenant Pivotal fronts.
 * MCM applies no uniqueness constraint and no cross-DFSP comparison, which is what
 * makes registering the CA rather than each leaf workable.
 */
export class PostDfspCaRequest {

    @ApiProperty({type: String})
    rootCertificate!: string;

    /**
     * The intermediates between the root and the leaves, issuer-first. Needed wherever the Hub
     * verifies a certificate Pivotal's CA issued from an intermediate: MCM passes root and chain
     * together to the Hub's egress gateway as its trust anchor, and the root alone cannot complete
     * a path to a leaf.
     */
    @ApiProperty({type: String, required: false})
    intermediateChain?: string;
}
