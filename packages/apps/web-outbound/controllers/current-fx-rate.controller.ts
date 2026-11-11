// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Controller, Get, Inject, Query, Res} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {Response} from 'express';
import {GetCurrentFxRateQuery} from '@core/outbound/domain/query/get-current-fx-rate.query';
import {FspiopErrors, FspiopException} from '@shared/fspiop';
import {SignedGet} from '../component/signed-transfer-status.decorator';

@SignedGet()
@Controller('secured/rates')
export class CurrentFxRateController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    async get(
        @Query('baseCurrency') baseCurrency: string | undefined,
        @Query('quoteCurrency') quoteCurrency: string | undefined,
        @Res({passthrough: true}) response: Response,
    ): Promise<string> {
        const output: GetCurrentFxRateQuery.Output = await this.queryBus.execute(
            new GetCurrentFxRateQuery(
                CurrentFxRateController.requireCurrency(baseCurrency, 'baseCurrency'),
                CurrentFxRateController.requireCurrency(quoteCurrency, 'quoteCurrency'),
            ),
        );

        response.type('application/json');

        return output.body;
    }

    private static requireCurrency(value: unknown, name: string): string {
        if (value == null || value === '') {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                `${name} query parameter is required.`,
            );
        }

        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                `${name} query parameter must contain exactly one non-blank string value.`,
            );
        }

        return value;
    }
}
