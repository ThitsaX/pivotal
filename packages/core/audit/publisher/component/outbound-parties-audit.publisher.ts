import { Injectable } from '@nestjs/common';
import { NatsClientService } from '@shared/nats';
import { OutboundPartiesDto } from '../dto';

@Injectable()
export class OutboundPartiesAuditPublisher {

    constructor(private readonly nats: NatsClientService) {}

    publish(sourceFsp: string, outboundParties: OutboundPartiesDto): void {
        const subject = `${sourceFsp}:parties`;

        this.nats.nc.publish(subject, this.nats.codec.encode(outboundParties));
    }
}
