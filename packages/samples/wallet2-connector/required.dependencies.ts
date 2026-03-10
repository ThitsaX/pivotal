import {ConfigService} from '@nestjs/config';
import {ConnectorConsumerModule} from '@core/connector/consumer';
import {FspClient} from '@core/connector/domain';
import {Wallet2FspClient} from './wallet2-fsp-client';

export class Wallet2ConnectorDependencies implements ConnectorConsumerModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';

    constructor(private readonly configService: ConfigService = new ConfigService()) {}

    natsUrl(): string {
        return this.configService.get<string>('NATS_URL') ?? Wallet2ConnectorDependencies.DEFAULT_NATS_URL;
    }

    fspClient(): FspClient {
        return new Wallet2FspClient();
    }
}
