import {Injectable} from '@nestjs/common';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';

/**
 * Publishes FSPIOP callback messages onto NATS subjects.
 *
 * This is the sending side of the async FSPIOP callback pattern.
 * Build subjects with FspiopPubSubSubjects before calling these methods:
 *
 *   publisher.publishSuccess(
 *     FspiopPubSubSubjects.Parties.forSuccess(payer, payee, type, id),
 *     putPartiesResponse,
 *   );
 *
 *   publisher.publishError(
 *     FspiopPubSubSubjects.Parties.forError(payer, payee, type, id),
 *     errorInformationObject,
 *   );
 *
 * NATS publish is fire-and-forget — the message is handed to the NATS server
 * immediately and the call returns synchronously. No timeout is needed here;
 * timeout concerns belong to the subscriber side (FspiopResponseSubscriber).
 */
@Injectable()
export class FspiopResponsePublisher {

    constructor(private readonly nats: NatsClientService) {}

    /**
     * Publishes a successful FSPIOP callback response to the given subject.
     * The response is JSON-encoded via the shared NATS codec.
     *
     * @param subject  NATS subject, e.g. from FspiopPubSubSubjects.Parties.forSuccess(...)
     * @param response The typed response payload (e.g. PartiesTypeIDPutResponse)
     */
    publishSuccess<T>(subject: string, response: T): void {
        this.nats.nc.publish(subject, this.nats.codec.encode(response));
    }

    /**
     * Publishes an FSPIOP error callback to the given subject.
     * The error object is JSON-encoded via the shared NATS codec.
     *
     * @param subject Subject, e.g. from FspiopPubSubSubjects.Parties.forError(...)
     * @param error   The FSPIOP ErrorInformationObject received from the switch
     */
    publishError(subject: string, error: ErrorInformationObject): void {
        this.nats.nc.publish(subject, this.nats.codec.encode(error));
    }
}
