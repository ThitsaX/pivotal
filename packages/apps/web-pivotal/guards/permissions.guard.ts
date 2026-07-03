// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Logger} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {IS_PUBLIC_KEY, REQUIRES_PERMISSION_KEY} from '@core/auth/domain';
import type {Request} from 'express';

@Injectable()
export class PermissionsGuard implements CanActivate {

    private static readonly LOGGER = new Logger(PermissionsGuard.name);

    constructor(
        @Inject(Reflector)
        private readonly reflector: Reflector,
    ) {
    }

    canActivate(context: ExecutionContext): boolean {

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const requiredPermission = this.reflector.getAllAndOverride<string>(REQUIRES_PERMISSION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // No @RequiresPermission on the handler = authenticated-only.
        // JwtAuthGuard has already verified the JWT (or this code wouldn't run on a non-public route).
        if (requiredPermission == null) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const claims = request.authUser;

        if (claims == null) {
            PermissionsGuard.LOGGER.error(
                'PermissionsGuard reached without auth claims. Likely @Public + @RequiresPermission on the same handler.',
            );
            throw new ForbiddenException({code: 'AUTH_FORBIDDEN', message: 'Permission denied.'});
        }

        if (!claims.permissions.includes(requiredPermission)) {
            throw new ForbiddenException({code: 'AUTH_FORBIDDEN', message: 'Permission denied.'});
        }

        return true;
    }
}
