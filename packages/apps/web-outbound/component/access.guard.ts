// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CanActivate, ExecutionContext} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {RedisClient} from '@core/outbound/domain';
import {FspiopErrors, FspiopException, FspiopHeaders} from '@shared/fspiop';
import {AccessKeyStore, PublicKey} from '@shared/security';
import {Jwt} from '@shared/security/component/jwt';
import {Request} from 'express';
import {JwtPolicy} from './jwt-policy';
import {IS_PUBLIC_KEY} from './public.decorator';
import {IS_SIGNED_TRANSFER_STATUS_KEY} from './signed-transfer-status.decorator';

export class AccessGuard implements CanActivate {

    private static readonly AUTHORIZATION_HEADER_NAME = 'authorization';

    private static readonly SIGNED_LOOKUP_FRESHNESS_MS = 5 * 60 * 1000;

    private static readonly NONCE_KEY_PREFIX = 'nonce:';

    private static readonly NONCE_TTL_MS = 10 * 60 * 1000;

    constructor(
        private readonly accessKeyStore: AccessKeyStore,
        private readonly policy: JwtPolicy,
        private readonly reflector: Reflector,
        private readonly redisClient: RedisClient,
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

        const isSignedTransferStatus = this.reflector.getAllAndOverride<boolean>(
            IS_SIGNED_TRANSFER_STATUS_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isSignedTransferStatus) {
            await this.verifySignedTransferStatus(context.switchToHttp().getRequest<Request>());
            return true;
        }

        if (!this.policy.enabled) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        this.verifyPayloadSignature(request);

        return true;
    }

    private verifyPayloadSignature(request: Request): void {
        const {publicKey} = this.resolveSourceAndKey(request);
        const authorization = AccessGuard.requireAuthorization(request);
        const token = AccessGuard.toToken(authorization);

        if (!Jwt.verify(publicKey, token)) {
            throw AccessGuard.invalidSignature('Authorization signature verification failed.');
        }

        const requestPayload = AccessGuard.resolvePayload(request);
        const tokenPayload = AccessGuard.decodeTokenObject(
            token.body,
            'Header authorization payload must be a valid JSON object.',
        );

        if (
            AccessGuard.toCanonicalJson(requestPayload)
            !== AccessGuard.toCanonicalJson(tokenPayload)
        ) {
            throw AccessGuard.invalidSignature('Authorization payload does not match request body.');
        }
    }

    private async verifySignedTransferStatus(request: Request): Promise<void> {
        const {source, publicKey} = this.resolveSourceAndKey(request);
        const date = AccessGuard.requireHeader(request, FspiopHeaders.Names.DATE);
        const authorization = AccessGuard.requireAuthorization(request);
        const token = AccessGuard.toToken(authorization);
        const protectedHeader = AccessGuard.decodeTokenObject(
            token.header,
            'Header authorization protected header must be a valid JSON object.',
        );
        const payload = AccessGuard.decodeTokenObject(
            token.body,
            'Header authorization payload must be a valid JSON object.',
        );

        if (protectedHeader['alg'] !== 'RS256') {
            throw AccessGuard.invalidSignature('Authorization algorithm must be RS256.');
        }

        if (protectedHeader['typ'] !== 'JWT') {
            throw AccessGuard.invalidSignature('Authorization typ must be JWT.');
        }

        if (!Jwt.verify(publicKey, token)) {
            throw AccessGuard.invalidSignature('Authorization signature verification failed.');
        }

        if (token.body !== 'e30' || Object.keys(payload).length !== 0) {
            throw AccessGuard.invalidSignature('Authorization payload must be the empty JSON object.');
        }

        const expectedUri = request.originalUrl ?? request.url;

        if (protectedHeader['uri'] !== expectedUri) {
            throw AccessGuard.invalidSignature('Authorization uri does not match the request path.');
        }

        if (protectedHeader['method'] !== request.method) {
            throw AccessGuard.invalidSignature('Authorization method does not match the request method.');
        }

        if (protectedHeader['date'] !== date) {
            throw AccessGuard.invalidSignature('Authorization date does not match the date header.');
        }

        AccessGuard.validateFreshDate(date);
        const nonce = AccessGuard.toRequiredProtectedString(protectedHeader['nonce'], 'nonce');
        const reserved = await this.redisClient.reserve(
            `${AccessGuard.NONCE_KEY_PREFIX}${source}:${nonce}`,
            AccessGuard.NONCE_TTL_MS,
        );

        if (!reserved) {
            throw AccessGuard.invalidSignature('Authorization nonce has already been used.');
        }
    }

    private resolveSourceAndKey(request: Request): {source: string; publicKey: PublicKey} {
        const source = AccessGuard.requireHeader(request, FspiopHeaders.Names.FSPIOP_SOURCE);
        const publicKey = this.accessKeyStore.get(source);

        if (publicKey == null) {
            throw AccessGuard.invalidSignature(
                `No trusted access public key registered for fspiop-source: '${source}'.`,
            );
        }

        return {source, publicKey};
    }

    private static requireAuthorization(request: Request): string {
        return AccessGuard.requireHeader(request, AccessGuard.AUTHORIZATION_HEADER_NAME);
    }

    private static requireHeader(request: Request, name: string): string {
        const raw = request.headers[name];

        if (raw == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                `Missing mandatory header: ${name}.`,
            );
        }

        if (Array.isArray(raw)) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                `Header ${name} must contain exactly one value.`,
            );
        }

        const value = String(raw).trim();

        if (value.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                `Header ${name} must not be empty.`,
            );
        }

        return value;
    }

    private static toToken(authorization: string): Jwt.Token {
        const tokenParts = authorization.split('.');

        if (tokenParts.length !== 3 || tokenParts.some((part, index) => index < 2 && part.length === 0)) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'Header authorization must be a valid compact JWS token.',
            );
        }

        return new Jwt.Token(tokenParts[0], tokenParts[1], tokenParts[2]);
    }

    private static validateFreshDate(date: string): void {
        const timestamp = Date.parse(date);

        if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== date) {
            throw AccessGuard.invalidSignature('Header date must be a valid RFC 7231 HTTP-date.');
        }

        const now = Date.now();

        if (Math.abs(now - timestamp) > AccessGuard.SIGNED_LOOKUP_FRESHNESS_MS) {
            throw AccessGuard.invalidSignature('Header date is outside the allowed clock window.');
        }
    }

    private static toRequiredProtectedString(value: unknown, name: string): string {
        if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                `Authorization protected header ${name} must be a non-empty string of at most 128 characters.`,
            );
        }

        return value;
    }

    private static invalidSignature(message: string): FspiopException {
        return new FspiopException(FspiopErrors.INVALID_SIGNATURE, message);
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

    private static decodeTokenObject(encodedValue: string, errorMessage: string): Record<string, unknown> {
        try {
            const decoded = Jwt.decode(encodedValue);
            const payload = JSON.parse(decoded) as unknown;

            if (!AccessGuard.isJsonObject(payload)) {
                throw new Error('JWT payload must be a JSON object.');
            }

            return payload;
        } catch {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                errorMessage,
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
