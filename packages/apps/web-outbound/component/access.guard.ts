// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FspiopErrors, FspiopException, FspiopHeaders } from '@shared/fspiop';
import { Jwt } from '@shared/security/component/jwt';
import { Request } from 'express';
import { AccessKeyStore } from '@shared/security';
import { JwtPolicy } from './jwt-policy';
import { IS_PUBLIC_KEY } from './public.decorator';

export class AccessGuard implements CanActivate {

    private static readonly AUTHORIZATION_HEADER_NAME = 'authorization';

    constructor(
        private readonly accessKeyStore: AccessKeyStore,
        private readonly policy: JwtPolicy,
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

        if (!this.policy.enabled) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        const rawSource = request.headers[FspiopHeaders.Names.FSPIOP_SOURCE];

        if (!rawSource) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-source.',
            );
        }

        const source = String(rawSource);
        const publicKey = this.accessKeyStore.get(source);

        if (!publicKey) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                `No trusted access public key registered for fspiop-source: '${source}'.`,
            );
        }

        const rawAuthorization = request.headers[AccessGuard.AUTHORIZATION_HEADER_NAME];

        if (!rawAuthorization) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: authorization.',
            );
        }

        const authorization = String(rawAuthorization).trim();

        if (authorization.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Header authorization must not be empty.',
            );
        }

        const tokenParts = authorization.split('.');

        if (tokenParts.length !== 3) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'Header authorization must be a valid JWT token.',
            );
        }

        const token = new Jwt.Token(tokenParts[0], tokenParts[1], tokenParts[2]);

        if (!Jwt.verify(publicKey, token)) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Authorization signature verification failed.',
            );
        }

        const requestPayload = AccessGuard.resolvePayload(request);
        const tokenPayload = AccessGuard.decodeTokenPayload(tokenParts[1]);

        if (
            AccessGuard.toCanonicalJson(requestPayload)
            !== AccessGuard.toCanonicalJson(tokenPayload)
        ) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Authorization payload does not match request body.',
            );
        }

        return true;
    }

    private static isJsonObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value != null && !Array.isArray(value);
    }


    private static resolvePayload(request: Request): Record<string, unknown> {
        if (AccessGuard.isJsonObject(request.body) && Object.keys(request.body).length > 0) {
            return request.body;
        }

        const date = request.headers[FspiopHeaders.Names.DATE];

        return {
            date: date != null ? String(date) : '',
        };
    }

    private static decodeTokenPayload(encodedPayload: string): Record<string, unknown> {
        try {
            const decoded = Jwt.decode(encodedPayload);
            const payload = JSON.parse(decoded) as unknown;

            if (!AccessGuard.isJsonObject(payload)) {
                throw new Error('JWT payload must be a JSON object.');
            }

            return payload;
        } catch {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'Header authorization payload must be a valid JSON object.',
            );
        }
    }

    private static toCanonicalJson(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((item) => AccessGuard.toCanonicalJson(item)).join(',')}]`;
        }

        if (AccessGuard.isJsonObject(value)) {
            const entries = Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => `${JSON.stringify(key)}:${AccessGuard.toCanonicalJson(item)}`);

            return `{${entries.join(',')}}`;
        }

        return JSON.stringify(value);
    }
}
