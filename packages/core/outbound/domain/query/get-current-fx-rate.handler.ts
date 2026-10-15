// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Logger } from '@nestjs/common';
import { QueryHandler } from '@nestjs/cqrs';
import { CatalystAxios, CatalystException } from '@shared/catalyst';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { GetCurrentFxRateQuery } from './get-current-fx-rate.query';

@QueryHandler(GetCurrentFxRateQuery)
export class GetCurrentFxRateHandler {

    private readonly logger = new Logger(GetCurrentFxRateHandler.name);

    constructor(
        @Inject(CatalystAxios)
        private readonly catalystAxios: CatalystAxios,
    ) {
    }

    async execute(query: GetCurrentFxRateQuery): Promise<GetCurrentFxRateQuery.Output> {
        try {
            this.logger.log(
                `Requesting current FX rate from Catalyst: ${JSON.stringify({
                    baseCurrency: query.baseCurrency,
                    quoteCurrency: query.quoteCurrency,
                })}`,
            );

            return await this.catalystAxios.getCurrentFxRate(
                query.baseCurrency,
                query.quoteCurrency,
            );
        } catch (error) {
            this.logger.error(
                `Error occurred while requesting current FX rate from Catalyst: ${JSON.stringify({
                    baseCurrency: query.baseCurrency,
                    quoteCurrency: query.quoteCurrency,
                    error: error instanceof Error ? error.message : error,
                })}`,
            );
            if (!(error instanceof CatalystException)) {
                throw error;
            }

            throw new FspiopException(
                GetCurrentFxRateHandler.toPivotalError(error.code),
                error,
            );
        }
    }

    private static toPivotalError(code: string) {
        switch (code) {
            case 'FX_RATE_NOT_FOUND':
                return FspiopErrors.GENERIC_VALIDATION_ERROR;
            case 'ARGUMENT_TYPE_MISMATCH':
                return FspiopErrors.MALFORMED_SYNTAX;
            case 'MISSING_PARAMETER':
                return FspiopErrors.MISSING_MANDATORY_ELEMENT;
            case 'CATALYST_TIMEOUT':
            case 'CATALYST_HTTP_408':
            case 'CATALYST_HTTP_504':
                return FspiopErrors.SERVER_TIMED_OUT;
            case 'CATALYST_HTTP_503':
                return FspiopErrors.SERVICE_CURRENTLY_UNAVAILABLE;
            default:
                return FspiopErrors.COMMUNICATION_ERROR;
        }
    }
}
