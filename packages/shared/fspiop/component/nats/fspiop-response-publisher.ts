import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';

export class FspiopResponsePublisher {

    constructor(private readonly nats: NatsClientService) {}

    publishSuccess<T>(subject: string, response: T): void {
        this.nats.nc.publish(subject, this.nats.codec.encode(response));
    }

    publishError(subject: string, error: ErrorInformationObject): void {
        this.nats.nc.publish(subject, this.nats.codec.encode(error));
    }
}
