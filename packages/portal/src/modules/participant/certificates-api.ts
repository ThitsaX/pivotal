// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {apiClient, ApiError} from '../../api/client';

const CERTIFICATES_PATH = '/participant/certificates';

/** Lifecycle states from `participant_cert_status`. Unknown codes render as themselves. */
export type CertificateStatus = 'active' | 'retiring' | 'revoked' | 'expired' | string;

export interface DfspCertificateSummary {
    id:                string;
    fspId:             string;
    serial:            string;
    fingerprintSha256: string;
    subject:           string;
    status:            CertificateStatus;
    validFrom:         string;
    validTo:           string;
    issuedAt:          string;
    revokedAt:         string | null;
    note:              string | null;
}

export interface DfspCertificateMaterial {
    id:         string;
    fspId:      string;
    serial:     string;
    status:     CertificateStatus;
    certPem:    string;
    caChainPem: string | null;
}

export interface EnrolledDfspCertificate extends DfspCertificateMaterial {
    fingerprintSha256: string;
    subject:           string;
    validFrom:         string;
    validTo:           string;
}

function formatApiError(error: ApiError): Error {

    if (error.code != null && error.code.length > 0 && !error.message.includes(error.code)) {
        return new Error(`${error.code}: ${error.message}`);
    }

    return new Error(error.message);
}

async function call<T>(operation: () => Promise<T>): Promise<T> {

    try {
        return await operation();
    } catch (error) {
        if (error instanceof ApiError) {
            throw formatApiError(error);
        }
        throw error;
    }
}

export function listDfspCertificates(fspId: string): Promise<{certificates: DfspCertificateSummary[]}> {
    return call(() => apiClient.get<{certificates: DfspCertificateSummary[]}>(
        `${CERTIFICATES_PATH}?fspId=${encodeURIComponent(fspId)}`));
}

export function enrollDfspCertificate(
    fspId: string,
    csrPem: string,
    note?: string,
): Promise<EnrolledDfspCertificate> {

    return call(() => apiClient.post<EnrolledDfspCertificate>(
        CERTIFICATES_PATH, {fspId, csrPem, ...(note == null || note.length === 0 ? {} : {note})}));
}

export function getDfspCertificate(id: string): Promise<DfspCertificateMaterial> {
    return call(() => apiClient.get<DfspCertificateMaterial>(
        `${CERTIFICATES_PATH}/${encodeURIComponent(id)}`));
}

export function revokeDfspCertificate(id: string, reason?: string): Promise<unknown> {
    return call(() => apiClient.post<unknown>(
        `${CERTIFICATES_PATH}/${encodeURIComponent(id)}/revoke`,
        reason == null || reason.length === 0 ? {} : {reason}));
}

/**
 * The certificate followed by its issuing chain, in one file.
 *
 * Both are needed together: a DFSP that installs only the leaf presents an incomplete chain, and
 * the peer then cannot build a path to the root — a failure that looks like a bad certificate
 * rather than a missing one.
 */
export function toDownloadableBundle(material: DfspCertificateMaterial): string {

    const parts = [material.certPem.trim()];

    if (material.caChainPem != null && material.caChainPem.trim().length > 0) {
        parts.push(material.caChainPem.trim());
    }

    return `${parts.join('\n')}\n`;
}
