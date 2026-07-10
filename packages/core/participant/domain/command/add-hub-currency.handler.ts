// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {AddHubCurrencyCommand} from './add-hub-currency.command';

@CommandHandler(AddHubCurrencyCommand)
export class AddHubCurrencyHandler
    implements ICommandHandler<AddHubCurrencyCommand, AddHubCurrencyCommand.Output> {

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
    ) {
    }

    async execute(command: AddHubCurrencyCommand): Promise<AddHubCurrencyCommand.Output> {
        await this.centralLedgerFacade.addHubCurrency(command.input.currency);

        return new AddHubCurrencyCommand.Output(command.input.currency);
    }
}
