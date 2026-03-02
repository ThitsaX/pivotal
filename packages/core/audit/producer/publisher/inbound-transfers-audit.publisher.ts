import {NatsClientService} from '@shared/nats';
import {AuditInboundTransfersCommand} from '../../domain/command';

export class InboundTransfersAuditPublisher {

    static readonly SUBJECT = 'audit.inbound.transfers';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditInboundTransfersCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            InboundTransfersAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
