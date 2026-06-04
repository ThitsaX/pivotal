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

      this.logger.log(`Successfully retrieved DFSP List count: ${dfspList.length}`);

      return dfspList;
   }
}