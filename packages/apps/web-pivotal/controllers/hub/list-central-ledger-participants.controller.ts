import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {ListCentralLedgerParticipantsQuery} from '@core/participant/domain';

@Controller('participant')
export class ListCentralLedgerParticipantsController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('list')
    async listParticipants(): Promise<ListCentralLedgerParticipantsQuery.Output> {
        return this.queryBus.execute(new ListCentralLedgerParticipantsQuery());
    }
}
