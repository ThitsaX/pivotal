// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Logger } from '@nestjs/common';
import { QueryHandler } from '@nestjs/cqrs';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { PrefixOracleClient } from '../component';
import { GetDfspListByUsecaseQuery } from './get-dfsp-list-by-usecase.query';

@QueryHandler(GetDfspListByUsecaseQuery)
export class GetDfspListByUsecaseHandler {

    private readonly logger = new Logger(GetDfspListByUsecaseHandler.name);

    constructor(
        @Inject(PrefixOracleClient)
        private readonly prefixOracleClient: PrefixOracleClient,
    ) {
    }

    async execute(query: GetDfspListByUsecaseQuery): Promise<GetDfspListByUsecaseQuery.Output> {
        const usecase = query.usecase?.trim();

        if (!usecase) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'usecase is required.',
            );
        }

        this.logger.log(`Get DFSP List with usecase: ${usecase}`);

        const dfspList = await this.prefixOracleClient.getDfspListByUsecase(usecase);
        

        return dfspList;
    }
}
