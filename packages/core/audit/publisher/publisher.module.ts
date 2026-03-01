import {Module} from '@nestjs/common';
import {NATS_URL, NatsClientService} from '@shared/nats';
import {OutboundPartiesAuditPublisher} from './component';

const Publishers = [OutboundPartiesAuditPublisher];

@Module({
    providers: [
        {
            provide: NATS_URL,
            useFactory: (): string => process.env['NATS_URL'] ?? 'nats://localhost:4222',
        },
        NatsClientService,
        ...Publishers,
    ],
    exports: [...Publishers],
})
export class AuditPublisherModule {}
