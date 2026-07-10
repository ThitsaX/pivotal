// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {randomBytes, createHash} from 'node:crypto';
import {Inject, Injectable} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Snowflake} from '@shared/snowflake';
import {AUTH_DOMAIN_REQUIRED_SETTINGS, AuthDomainSettings} from './auth-domain-settings';

export interface AccessTokenClaims {
    sub: string;
    role: string;
    fspId: string | null;
    permissions: string[];
    mustChangePassword: boolean;
    iss: string;
    iat: number;
    exp: number;
    jti: string;
}

export interface IssuedRefreshToken {
    plaintext: string;
    hash: string;
    expiresAt: Date;
}

@Injectable()
export class TokenService {

    private static readonly SNOWFLAKE = Snowflake.get();

    private static readonly REFRESH_TOKEN_BYTES = 32;

    constructor(
        private readonly jwtService: JwtService,
        @Inject(AUTH_DOMAIN_REQUIRED_SETTINGS)
        private readonly settings: AuthDomainSettings,
    ) {
    }

    async signAccessToken(input: {
        userId: string;
        roleCode: string;
        fspId: string | null;
        mustChangePassword: boolean;
        permissions: string[];
    }): Promise<string> {

        const ttl = this.settings.accessTokenTtlSeconds();
        const now = Math.floor(Date.now() / 1000);

        // Omit `iss` from the payload — `JwtModule.signOptions.issuer` adds it.
        // `iat`/`exp`/`jti` stay here because no matching option is set at the module level.
        const payload: Omit<AccessTokenClaims, 'iss'> = {
            sub:                input.userId,
            role:               input.roleCode,
            fspId:              input.fspId,
            permissions:        input.permissions,
            mustChangePassword: input.mustChangePassword,
            iat:                now,
            exp:                now + ttl,
            jti:                TokenService.SNOWFLAKE.nextId().toString(),
        };

        return this.jwtService.signAsync(payload, {
            secret:    this.settings.jwtSecret(),
            algorithm: 'HS256',
        });
    }

    async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {

        try {
            const claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
                secret:     this.settings.jwtSecret(),
                algorithms: ['HS256'],
                issuer:     this.settings.jwtIssuer(),
            });

            return claims;

        } catch {
            return null;
        }
    }

    issueRefreshToken(): IssuedRefreshToken {

        const plaintext = randomBytes(TokenService.REFRESH_TOKEN_BYTES).toString('base64url');
        const hash = TokenService.hashRefreshToken(plaintext);
        const ttlDays = this.settings.refreshTokenTtlDays();
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

        return {plaintext, hash, expiresAt};
    }

    static hashRefreshToken(plaintext: string): string {
        return createHash('sha256').update(plaintext).digest('hex');
    }
}
