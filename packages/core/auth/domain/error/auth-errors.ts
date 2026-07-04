// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class AuthErrorCode {

    static readonly INVALID_CREDENTIALS         = 'AUTH_INVALID_CREDENTIALS';

    static readonly ACCOUNT_LOCKED              = 'AUTH_ACCOUNT_LOCKED';

    static readonly INVALID_REFRESH_TOKEN       = 'AUTH_INVALID_REFRESH_TOKEN';

    static readonly REFRESH_TOKEN_REUSE         = 'AUTH_REFRESH_TOKEN_REUSE_DETECTED';

    static readonly PASSWORD_SAME_AS_CURRENT    = 'AUTH_PASSWORD_SAME_AS_CURRENT';

    static readonly UNKNOWN_ROLE                = 'AUTH_UNKNOWN_ROLE';

    static readonly TOKEN_REVOKED               = 'AUTH_TOKEN_REVOKED';

    static readonly USER_INACTIVE               = 'AUTH_USER_INACTIVE';
}

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
    [AuthErrorCode.INVALID_CREDENTIALS]:      'Invalid email or password.',
    [AuthErrorCode.ACCOUNT_LOCKED]:           'Invalid email or password.',
    [AuthErrorCode.INVALID_REFRESH_TOKEN]:    'Invalid or expired refresh token.',
    [AuthErrorCode.REFRESH_TOKEN_REUSE]:      'Invalid or expired refresh token.',
    [AuthErrorCode.PASSWORD_SAME_AS_CURRENT]: 'New password must differ from the current password.',
    [AuthErrorCode.UNKNOWN_ROLE]:             'Invalid email or password.',
    [AuthErrorCode.TOKEN_REVOKED]:            'Session has been revoked. Please sign in again.',
    [AuthErrorCode.USER_INACTIVE]:            'This account is inactive.',
};

export function authError(code: string): { code: string; message: string } {

    const message = AUTH_ERROR_MESSAGES[code];

    if (message == null) {
        throw new Error(`Unknown auth error code: ${code}`);
    }

    return {code, message};
}
