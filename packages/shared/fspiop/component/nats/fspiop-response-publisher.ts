// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleInit} from '@nestjs/common';
import {JetStreamClient} from 'nats';
import {NatsClientService} from '@shared/nats';
import {ErrorInformationObject} from '../../dto';
import {resolveFspiopResponseStream} from './fspiop-response-stream.resolver';

export class FspiopResponsePublisher implements OnModuleInit {

    private readonly logger = new Logger(FspiopResponsePublisher.name);
    private js: JetStreamClient | null = null;

    constructor(private readonly nats: NatsClientService) {
    }

    async onModuleInit(): Promise<void> {
        const jsm = await this.nats.nc.jetstreamManager();
        await resolveFspiopResponseStream(jsm);
        this.js = this.nats.nc.jetstream();
        this.logger.log('FSPIOP response JetStream publisher initialised.');
    }

    async publishSuccess<T>(subject: string, response: T): Promise<void> {
        await this.publish(subject, response);
    }

    async publishError(subject: string, error: ErrorInformationObject): Promise<void> {
        await this.publish(subject, error);
    }

    private async publish(subject: string, payload: unknown): Promise<void> {
        const js = this.js;

        if (js == null) {
            throw new Error('FspiopResponsePublisher used before module init.');
        }

        await js.publish(subject, this.nats.codec.encode(payload));
    }
}
