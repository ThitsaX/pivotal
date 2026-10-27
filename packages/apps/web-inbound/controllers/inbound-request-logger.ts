// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';

export class InboundRequestLogger {
    static logBodyBeforeRepresentationConversion(
        logger: Logger,
        operation: string,
        body: unknown,
    ): void {
        logger.debug(
            `Inbound ${operation} request received before ISO20022 representation conversion: ${JSON.stringify(body)}`,
        );
    }
}
