import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {ListCentralLedgerParticipantsQuery} from '@core/participant/domain';

@Controller('participant')
export class ListCentralLedgerParticipantsController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('list')
    @RequiresPermission(PermissionKey.PARTICIPANT_LIST)
    async listParticipants(): Promise<ListCentralLedgerParticipantsQuery.Output> {
        return this.queryBus.execute(new ListCentralLedgerParticipantsQuery());
    }
}
