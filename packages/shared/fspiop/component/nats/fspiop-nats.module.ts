import {Module} from '@nestjs/common';
import {NatsModule} from '@shared/nats';
import {FspiopResponsePublisher} from './fspiop-response-publisher';
import {FspiopResponseSubscriber} from './fspiop-response-subscriber';

/**
 * Provides the FSPIOP pub/sub components backed by NATS.
 *
 * Import this module wherever you need to publish or subscribe to
 * FSPIOP callback messages:
 *
 * @example
 * @Module({
 *   imports: [FspiopNatsModule],
 * })
 * export class SomeFeatureModule {}
 */
@Module({
    imports: [NatsModule],
    providers: [FspiopResponsePublisher, FspiopResponseSubscriber],
    exports: [FspiopResponsePublisher, FspiopResponseSubscriber],
})
export class FspiopNatsModule {}
