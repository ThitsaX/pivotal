import {Injectable} from '@nestjs/common';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject, PartiesTypeIDPutResponse} from '@shared/fspiop';

/**
 * Publishes FSPIOP party lookup callbacks to NATS so that
 * PartiesResponseSubscriber can resolve the awaiting DoLookupHandler.
 *
 * Subjects (must mirror PartiesResponseSubscriber):
 *   parties:<correlationId>        – success (PUT /parties)
 *   parties-error:<correlationId>  – error   (PUT /parties/.../error)
 */
@Injectable()
export class PartiesResponsePublisher {

    constructor(private readonly nats: NatsClientService) {}

    /**
     * Publish a successful PUT /parties body.
     * Resolves the waitFor() promise in PartiesResponseSubscriber.
     */
    publishSuccess(correlationId: string, response: PartiesTypeIDPutResponse): void {
        const subject = `parties:${correlationId}`;
        this.nats.nc.publish(subject, this.nats.codec.encode(response));
    }

    /**
     * Publish a PUT /parties/.../error body.
     * Rejects the waitFor() promise in PartiesResponseSubscriber with a FspiopException.
     */
    publishError(correlationId: string, body: ErrorInformationObject): void {
        const subject = `parties-error:${correlationId}`;
        this.nats.nc.publish(subject, this.nats.codec.encode(body));
    }
}
