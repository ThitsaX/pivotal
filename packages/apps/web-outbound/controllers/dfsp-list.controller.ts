// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetDfspListByUsecaseQuery, GetDfspListQuery } from '@core/outbound/domain';
import { Public } from '../component';

@Public()
@Controller()
export class DfspListController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('dfsp-list-with-prefixes-by-usecase/:usecase')
    async getDfspListByUsecase(
        @Param('usecase') usecase: string,
    ): Promise<GetDfspListByUsecaseQuery.Output> {
        return this.queryBus.execute(
            new GetDfspListByUsecaseQuery(usecase),
        );
    }

    @Get('dfsp-list-with-prefixes')
    async getDfspList(): Promise<GetDfspListQuery.Output> {
        return this.queryBus.execute(
            new GetDfspListQuery(),
        );
    }
}
