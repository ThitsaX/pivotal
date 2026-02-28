import { Module } from '@nestjs/common';
import { NatsModule } from '@shared/nats';
import { OutboundPartiesAuditPublisher } from './component';

const Publishers = [OutboundPartiesAuditPublisher];

@Module({
  imports: [NatsModule],
  providers: [...Publishers],
  exports: [...Publishers],
})
export class AuditPublisherModule {}
