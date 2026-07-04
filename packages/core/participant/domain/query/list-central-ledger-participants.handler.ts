// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {ListCentralLedgerParticipantsQuery} from './list-central-ledger-participants.query';

@QueryHandler(ListCentralLedgerParticipantsQuery)
export class ListCentralLedgerParticipantsHandler
    implements IQueryHandler<ListCentralLedgerParticipantsQuery, ListCentralLedgerParticipantsQuery.Output> {

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
    ) {
    }

    async execute(): Promise<ListCentralLedgerParticipantsQuery.Output> {
        return this.centralLedgerFacade.listAllParticipants();
    }
}
