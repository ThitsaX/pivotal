// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable, Logger, NestMiddleware} from '@nestjs/common';
import {NextFunction, Request, Response} from 'express';
import {MdcContext} from '@shared/foundation';
import {formatRequestBodyLog, formatRequestHeadersLog} from './request-log';

interface SendMoneyRequestBody {
    from?: {idValue?: unknown};
}

/** Logs headers and route-specific request bodies before guards run. */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {

    private static readonly POST_SEND_MONEY_PATH = '/secured/sendmoney';

    private static readonly SEND_MONEY_TRANSFER_PATH = /^\/secured\/sendmoney\/([^/?]+)$/;

    private static readonly TRANSFER_STATUS_PATH = /^\/secured\/transferStatus\/([^/?]+)$/;

    private readonly logger = new Logger(RequestLogMiddleware.name);

    use(request: Request, _response: Response, next: NextFunction): void {
        const values = RequestLogMiddleware.resolveMdcValues(request);

        MdcContext.run(values, () => {
            this.logger.log(formatRequestHeadersLog(
                request.method,
                request.originalUrl ?? request.url,
                request.headers,
            ));

            const bodyLog = formatRequestBodyLog(request.method, request.path, request.body);

            if (bodyLog != null) {
                this.logger.log(bodyLog);
            }

            next();
        });
    }

    private static resolveMdcValues(request: Request): Record<string, string | undefined> {
        const method = request.method.toUpperCase();
        const path = request.path;

        if (method === 'POST' && path === RequestLogMiddleware.POST_SEND_MONEY_PATH) {
            const body = (request.body ?? {}) as SendMoneyRequestBody;
            const idValue = body.from?.idValue;

            return {
                [MdcContext.ID_VALUE]: typeof idValue === 'string' ? idValue : undefined,
            };
        }

        const sendMoneyMatch = RequestLogMiddleware.SEND_MONEY_TRANSFER_PATH.exec(path);

        if (sendMoneyMatch != null) {
            return {[MdcContext.TRANSFER_ID]: sendMoneyMatch[1]};
        }

        const transferStatusMatch = RequestLogMiddleware.TRANSFER_STATUS_PATH.exec(path);

        if (transferStatusMatch != null) {
            return {[MdcContext.TRANSFER_ID]: transferStatusMatch[1]};
        }

        return {};
    }
}
