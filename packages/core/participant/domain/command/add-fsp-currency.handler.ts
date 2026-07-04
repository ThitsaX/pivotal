// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantRepository} from '../repository';
import {AddFspCurrencyCommand} from './add-fsp-currency.command';

@CommandHandler(AddFspCurrencyCommand)
export class AddFspCurrencyHandler
    implements ICommandHandler<AddFspCurrencyCommand, AddFspCurrencyCommand.Output> {

    private static toParticipantNotFoundError(name: string): PivotalException {
        return new PivotalException('PARTICIPANT_NOT_FOUND', `Participant not found for name: ${name}`);
    }

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: AddFspCurrencyCommand): Promise<AddFspCurrencyCommand.Output> {
        const participant = await this.repository.findByName(command.input.name, DbTarget.Write);

        if (participant == null) {
            throw AddFspCurrencyHandler.toParticipantNotFoundError(command.input.name);
        }

        await this.centralLedgerFacade.addFspCurrency(command.input.name, command.input.currency);

        return new AddFspCurrencyCommand.Output(participant.id);
    }
}
