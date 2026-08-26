// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Dfsp, DfspListWithCountResponse, GetDfspListByUsecaseQuery, GetDfspListQuery } from '@core/outbound/domain';
import { Public } from '../component';

@Public()
@Controller()
export class DfspListController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('dfsps-with-prefixes-and-count/:usecase')
    async getDfspListWithCountByUsecase(
        @Param('usecase') usecase: string,
    ): Promise<DfspListWithCountResponse> {
        const dfspList = await this.queryBus.execute(
            new GetDfspListByUsecaseQuery(usecase),
        );

        return DfspListController.withCount(dfspList);
    }

    @Get('dfsps-with-prefixes-and-count')
    async getDfspListWithCount(): Promise<DfspListWithCountResponse> {
        const dfspList = await this.queryBus.execute(
            new GetDfspListQuery(),
        );

        return DfspListController.withCount(dfspList);
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

    private static withCount(dfspList: Dfsp[]): DfspListWithCountResponse {
        return {
            totalNumberOfDfsp: dfspList.length,
            dfspList,
        };
    }
}
