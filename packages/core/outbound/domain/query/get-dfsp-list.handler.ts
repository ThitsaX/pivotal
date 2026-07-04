// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Inject, Logger } from '@nestjs/common';
import { QueryHandler } from '@nestjs/cqrs';
import { PrefixOracleClient } from '../component';
import { GetDfspListQuery } from './get-dfsp-list.query';

@QueryHandler(GetDfspListQuery)
export class GetDfspListHandler {

    private readonly logger = new Logger(GetDfspListHandler.name);

    constructor(
        @Inject(PrefixOracleClient)
        private readonly prefixOracleClient: PrefixOracleClient,
    ) {
    }

    async execute(): Promise<GetDfspListQuery.Output> {
        this.logger.log('Get DFSP List');

        const dfspList = await this.prefixOracleClient.getDfspList();

        return dfspList;
    }
}
