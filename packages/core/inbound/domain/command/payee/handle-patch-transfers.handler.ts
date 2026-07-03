// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {ConnectorPatchTransfersPublisher} from '@core/connector/publisher';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(ConnectorPatchTransfersPublisher)
        private readonly publisher: ConnectorPatchTransfersPublisher,
    ) {}

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;
        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, transferId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Transfers,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    request: response,
                    occurredAt: createdAt,
                },
            ),
        );

        await this.publisher.publish(
            new ConnectorPatchTransfersPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, transferId, response),
        );
        return new HandlePatchTransfersCommand.Output();
    }
}
