// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createParamDecorator, ExecutionContext} from '@nestjs/common';
import {AccessTokenClaims} from '@core/auth/domain';
import type {Request} from 'express';

type AuthenticatedRequest = Request & {
    authUser?: AccessTokenClaims;
};

export const AuthUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AccessTokenClaims | undefined => {
        const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        return request.authUser;
    },
);
