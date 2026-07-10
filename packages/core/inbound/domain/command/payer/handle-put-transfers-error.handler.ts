// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersErrorCommand} from './handle-put-transfers-error.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutTransfersErrorCommand)
export class HandlePutTransfersErrorHandler
    implements ICommandHandler<HandlePutTransfersErrorCommand, HandlePutTransfersErrorCommand.Output>
{

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersErrorCommand): Promise<HandlePutTransfersErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, error} = command.input;

        if (error == null) {
            return new HandlePutTransfersErrorCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, transferId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.error(
                TransactionMessage.InvocationPhase.Transfers,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    error,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Transfers.forError(
            payerFsp,
            transferId,
        );

        await this.publisher.publishError(subject, error);

        return new HandlePutTransfersErrorCommand.Output();
    }
}
