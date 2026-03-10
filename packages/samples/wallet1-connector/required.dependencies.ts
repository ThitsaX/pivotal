import {ConfigService} from '@nestjs/config';
import {FspClient, InboundConnectorModule} from '@core/inbound/connector';
import {Wallet1FspClient} from './wallet1-fsp-client';

export class Wallet1ConnectorDependencies implements InboundConnectorModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';

    constructor(private readonly configService: ConfigService = new ConfigService()) {}

    natsUrl(): string {
        return this.configService.get<string>('NATS_URL') ?? Wallet1ConnectorDependencies.DEFAULT_NATS_URL;
    }

    fspClient(): FspClient {
        return new Wallet1FspClient();
    }
}
