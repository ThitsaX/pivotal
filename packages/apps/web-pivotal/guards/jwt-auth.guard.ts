// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {
    AccessTokenClaims,
    authError,
    AuthErrorCode,
    IS_PUBLIC_KEY,
    TokenService,
    UserRepository,
} from '@core/auth/domain';
import type {Request} from 'express';

declare module 'express' {
    interface Request {
        authUser?: AccessTokenClaims;
    }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {

    private static readonly BEARER_PREFIX = 'Bearer ';

    constructor(
        @Inject(TokenService)
        private readonly tokenService: TokenService,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(Reflector)
        private readonly reflector: Reflector,
    ) {
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const header = request.headers['authorization'];

        if (typeof header !== 'string' || !header.startsWith(JwtAuthGuard.BEARER_PREFIX)) {
            throw new UnauthorizedException({code: 'AUTH_MISSING_TOKEN', message: 'Missing or malformed Authorization header.'});
        }

        const token = header.slice(JwtAuthGuard.BEARER_PREFIX.length).trim();
        const claims = await this.tokenService.verifyAccessToken(token);

        if (claims == null) {
            throw new UnauthorizedException({code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired access token.'});
        }

        const user = await this.userRepository.findById(claims.sub);

        if (user == null || !user.isActive) {
            throw new UnauthorizedException(authError(AuthErrorCode.USER_INACTIVE));
        }

        if (user.tokensInvalidatedAt != null
            && Math.floor(user.tokensInvalidatedAt.getTime() / 1000) >= claims.iat) {
            throw new UnauthorizedException(authError(AuthErrorCode.TOKEN_REVOKED));
        }

        request.authUser = claims;
        return true;
    }
}
