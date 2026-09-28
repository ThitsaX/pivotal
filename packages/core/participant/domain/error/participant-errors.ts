// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class ParticipantErrorCode {

    static readonly UNKNOWN_PARTICIPANT          = 'PARTICIPANT_UNKNOWN';

    static readonly CSR_MALFORMED                = 'PARTICIPANT_CERT_CSR_MALFORMED';

    static readonly CSR_KEY_TOO_SMALL            = 'PARTICIPANT_CERT_CSR_KEY_TOO_SMALL';

    static readonly CERT_ISSUANCE_FAILED         = 'PARTICIPANT_CERT_ISSUANCE_FAILED';

    static readonly CERT_NOT_FOUND               = 'PARTICIPANT_CERT_NOT_FOUND';

    static readonly CERT_ALREADY_REVOKED         = 'PARTICIPANT_CERT_ALREADY_REVOKED';

    static readonly CERT_STATUS_UNKNOWN          = 'PARTICIPANT_CERT_STATUS_UNKNOWN';
}

export const PARTICIPANT_ERROR_MESSAGES: Record<string, string> = {
    [ParticipantErrorCode.UNKNOWN_PARTICIPANT]:  'No participant is registered with that identifier.',
    [ParticipantErrorCode.CSR_MALFORMED]:        'The certificate signing request could not be read. It must be a PEM-encoded PKCS#10 request.',
    [ParticipantErrorCode.CSR_KEY_TOO_SMALL]:    'The certificate signing request uses a key that is too small. RSA keys must be at least 2048 bits.',
    [ParticipantErrorCode.CERT_ISSUANCE_FAILED]: 'The certificate could not be issued. Please try again, and contact an administrator if the problem persists.',
    [ParticipantErrorCode.CERT_NOT_FOUND]:       'No certificate was found.',
    [ParticipantErrorCode.CERT_ALREADY_REVOKED]: 'That certificate has already been revoked.',
    [ParticipantErrorCode.CERT_STATUS_UNKNOWN]:  'That certificate status is not recognised.',
};

export function participantError(code: string): { code: string; message: string } {

    const message = PARTICIPANT_ERROR_MESSAGES[code];

    if (message == null) {
        throw new Error(`Unknown participant error code: ${code}`);
    }

    return {code, message};
}
