import {FspiopErrors, FspiopException} from '@shared/fspiop';

const BEARER_PREFIX = 'Bearer ';

export const validateAuthorizationHeader = (authorization: string | undefined): void => {
    const header = authorization?.trim();
    if (header == null || header.length === 0) {
        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'Missing mandatory header: authorization.',
        );
    }

    if (!header.startsWith(BEARER_PREFIX)) {
        throw new FspiopException(
            FspiopErrors.MALFORMED_SYNTAX,
            'Invalid authorization header format. Expected: Bearer <RS256 JWT>.',
        );
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (token.length === 0 || token.split('.').length !== 3) {
        throw new FspiopException(
            FspiopErrors.MALFORMED_SYNTAX,
            'Invalid bearer token format. Expected a JWT.',
        );
    }
};
