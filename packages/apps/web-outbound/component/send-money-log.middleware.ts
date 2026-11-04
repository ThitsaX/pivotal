// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { formatSendMoneyRequestHeadersLog, formatSendMoneyRequestLog } from './send-money-log';

/** Logs Send Money requests before guards run, including requests rejected by authentication. */
@Injectable()
export class SendMoneyLogMiddleware implements NestMiddleware {

    private readonly logger = new Logger(SendMoneyLogMiddleware.name);

    use(request: Request, _response: Response, next: NextFunction): void {
        this.logger.log(formatSendMoneyRequestLog(request.body));
        this.logger.log(formatSendMoneyRequestHeadersLog(request.body, request.headers));
        next();
    }
}
