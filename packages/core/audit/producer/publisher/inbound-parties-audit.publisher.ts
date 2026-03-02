import {NatsClientService} from '@shared/nats';
import {AuditInboundPartiesCommand} from '../../domain/command';

export class InboundPartiesAuditPublisher {

    static readonly SUBJECT = 'audit.inbound.parties';

    constructor(private readonly nats: NatsClientService) {}

    async publish(input: AuditInboundPartiesCommand.Input): Promise<void> {
        const js = this.nats.nc.jetstream();
        await js.publish(
            InboundPartiesAuditPublisher.SUBJECT,
            this.nats.codec.encode(input),
        );
    }
}
