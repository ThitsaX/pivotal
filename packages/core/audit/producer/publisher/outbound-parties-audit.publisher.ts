import {NatsClientService} from '@shared/nats';
import {AuditOutboundPartiesCommand} from '../../domain/command';

export class OutboundPartiesAuditPublisher {

    static readonly SUBJECT = 'audit.outbound.parties';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditOutboundPartiesCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            OutboundPartiesAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
