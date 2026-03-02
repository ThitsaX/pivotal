import {NatsClientService} from '@shared/nats';
import {AuditOutboundQuotesCommand} from '../../domain/command';

export class OutboundQuotesAuditPublisher {

    static readonly SUBJECT = 'audit.outbound.quotes';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditOutboundQuotesCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            OutboundQuotesAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
