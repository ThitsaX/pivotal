// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CanActivate, ExecutionContext, Injectable} from '@nestjs/common';
import {Request} from 'express';
import {FspiopSettings} from '@shared/fspiop/component/fspiop-settings';
import {Iso20022ContentType, Iso20022Resource} from '@shared/iso20022/iso20022-content-type';

@Injectable()
export class RepresentationHeaderGuard implements CanActivate {
    constructor(private readonly settings: FspiopSettings) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const resource = request.path.split('/')[1] as Iso20022Resource;
        if (Object.values(Iso20022Resource).includes(resource)) {
            Iso20022ContentType.validateHeaders(
                resource,
                this.settings.apiType,
                request.method,
                request.headers['content-type'],
                request.headers.accept,
            );
        }
        return true;
    }
}
