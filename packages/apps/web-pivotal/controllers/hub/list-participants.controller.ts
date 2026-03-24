import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {ListParticipantsQuery} from '@core/participant/domain';

@Controller('participant')
export class ListParticipantsController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('list')
    async listParticipants(): Promise<ListParticipantsQuery.Output> {
        return this.queryBus.execute(new ListParticipantsQuery());
    }
}
