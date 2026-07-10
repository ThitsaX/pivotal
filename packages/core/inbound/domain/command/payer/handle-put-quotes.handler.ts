// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesCommand} from './handle-put-quotes.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutQuotesCommand)
export class HandlePutQuotesHandler
    implements ICommandHandler<HandlePutQuotesCommand, HandlePutQuotesCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesCommand): Promise<HandlePutQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, quoteId, response} = command.input;

        if (response == null) {
            return new HandlePutQuotesCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, quoteId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.response(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    response,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Quotes.forSuccess(
            payerFsp,
            quoteId,
        );

        await this.publisher.publishSuccess(subject, response);

        return new HandlePutQuotesCommand.Output();
    }
}
