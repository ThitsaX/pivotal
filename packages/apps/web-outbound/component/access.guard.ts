import {CanActivate, ExecutionContext} from '@nestjs/common';
import {FspiopErrors, FspiopException, FspiopHeaders} from '@shared/fspiop';
import {Jwt} from '@shared/security/component/jwt';
import {Request} from 'express';
import {AccessKeyStore} from "@shared/security";

export class AccessGuard implements CanActivate {

    private static readonly AUTHORIZATION_HEADER_NAME = 'authorization';

    constructor(
        private readonly accessKeyStore: AccessKeyStore,
    ) {
    }

    private static resolveBody(request: Request): string {
        if (request.body != null && Object.keys(request.body as object).length > 0) {
            return JSON.stringify(request.body);
        }

        const date = request.headers[FspiopHeaders.Names.DATE];
        return JSON.stringify({date: date != null ? String(date) : ''});
    }

    canActivate(context: ExecutionContext): boolean {
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

        const body = AccessGuard.resolveBody(request);
        const bodyEncoded = Jwt.encode(body);
        const token = new Jwt.Token(tokenParts[0], bodyEncoded, tokenParts[2], authorization);

        if (!Jwt.verify(publicKey, token)) {
            // throw new FspiopException(
            //     FspiopErrors.INVALID_SIGNATURE,
            //     'Authorization signature verification failed.',
            // );
        }

        return true;
    }
}
