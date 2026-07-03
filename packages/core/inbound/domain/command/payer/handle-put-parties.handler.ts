// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesCommand} from './handle-put-parties.command';

@CommandHandler(HandlePutPartiesCommand)
export class HandlePutPartiesHandler
    implements ICommandHandler<HandlePutPartiesCommand, HandlePutPartiesCommand.Output> {

    constructor(
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesCommand): Promise<HandlePutPartiesCommand.Output> {
        const {payerFsp, payeeFsp, partyIdType, partyId, subId, response} = command.input;

        if (response == null) {
            return new HandlePutPartiesCommand.Output();
        }

        const subject = FspiopPubSubSubjects.Parties.forSuccess(
            payerFsp,
            payeeFsp,
            partyIdType,
            partyId,
            subId ?? undefined,
        );

        await this.publisher.publishSuccess(subject, response);

        return new HandlePutPartiesCommand.Output();
    }
}
