// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { formatSendMoneyRequestLog } from './send-money-log';

/**
 * Logs the outbound Post Send Money payload exactly once per call.
 *
 * Placed in an interceptor rather than the controller body because Nest runs
 * interceptors before pipes: this fires for requests the ValidationPipe rejects as well
 * as for requests that reach the handler, which is what "every outbound call logs the
 * request before it is sent" requires. It is bound to the POST handler alone, so no
 * route matching is needed and no other endpoint can emit a Send Money line.
 *
 * The body seen here is the raw parsed payload, before class-transformer normalisation -
 * i.e. what the caller actually sent, which is what an investigation needs.
 */
@Injectable()
export class SendMoneyLogInterceptor implements NestInterceptor {

    private readonly logger = new Logger(SendMoneyLogInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<Request>();

        this.logger.log(formatSendMoneyRequestLog(request?.body));

        return next.handle();
    }
}
