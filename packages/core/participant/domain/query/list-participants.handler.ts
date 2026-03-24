import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {ListParticipantsQuery} from './list-participants.query';

@QueryHandler(ListParticipantsQuery)
export class ListParticipantsHandler
    implements IQueryHandler<ListParticipantsQuery, ListParticipantsQuery.Output> {

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
    ) {
    }

    async execute(): Promise<ListParticipantsQuery.Output> {
        return this.centralLedgerFacade.listAllParticipants();
    }
}
