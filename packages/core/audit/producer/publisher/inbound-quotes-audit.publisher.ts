import {NatsClientService} from '@shared/nats';
import {AuditInboundQuotesCommand} from '../../domain/command';

export class InboundQuotesAuditPublisher {

    static readonly SUBJECT = 'audit.inbound.quotes';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditInboundQuotesCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            InboundQuotesAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
