import { Controller, Get, Inject, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetDfspListByUsecaseQuery, GetDfspListQuery } from '@core/outbound/domain';

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