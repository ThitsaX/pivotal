// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Controller, Get, Headers, Inject, Param} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {GetTransferStatusQuery} from '@core/outbound/domain';
import {FspiopErrors, FspiopException, FspiopHeaders, FspiopUserMessages} from '@shared/fspiop';
import {MdcContext} from '@shared/foundation';
import {SignedTransferStatus} from '../component';

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

@SignedTransferStatus()
@Controller('secured/transferStatus')
export class TransferStatusController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get(':transferId')
    async get(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string | undefined,
        @Param('transferId') rawTransferId: string,
    ): Promise<GetTransferStatusQuery.Output> {
        const transferId = TransferStatusController.toTransferId(rawTransferId);
        const requesterFspId = TransferStatusController.toSource(source);

        return MdcContext.run(
            {[MdcContext.TRANSFER_ID]: transferId},
            () => this.queryBus.execute(
                new GetTransferStatusQuery(
                    new GetTransferStatusQuery.Input(
                        transferId,
                        requesterFspId,
                        FspiopUserMessages.resolveLanguage(process.env['ERROR_MESSAGE_LANGUAGE']),
                    ),
                ),
            ),
        );
    }

    @Get()
    getWithoutTransferId(): never {
        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'transferId path parameter is required.',
        );
    }

    private static toSource(source: string | undefined): string {
        const normalized = source?.trim();

        if (normalized == null || normalized.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-source.',
            );
        }

        return normalized;
    }

    private static toTransferId(value: string | undefined): string {
        if (value == null || !ULID.test(value)) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'transferId must be a valid 26-character ULID.',
            );
        }

        return value;
    }
}
