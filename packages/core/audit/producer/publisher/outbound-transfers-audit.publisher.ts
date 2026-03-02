import {NatsClientService} from '@shared/nats';
import {AuditOutboundTransfersCommand} from '../../domain/command';

export class OutboundTransfersAuditPublisher {

    static readonly SUBJECT = 'audit.outbound.transfers';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditOutboundTransfersCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            OutboundTransfersAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
