import {ConfigService} from '@nestjs/config';
import type {WebInboundModule} from './web-inbound.module';

export class WebInboundDependencies implements WebInboundModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';

    constructor(private readonly configService: ConfigService = new ConfigService()) {
    }

    natsUrl(): string {
        return this.configService.get<string>('NATS_URL') ?? WebInboundDependencies.DEFAULT_NATS_URL;
    }
}
