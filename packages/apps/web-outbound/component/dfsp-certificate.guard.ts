// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ParticipantCertRepository, ParticipantCertStatusCode } from '@core/participant/domain';
import { FspiopErrors, FspiopException, FspiopHeaders, Xfcc } from '@shared/fspiop';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Requires that the client certificate and `FSPIOP-Source` name the same DFSP.
 *
 * A verified certificate on its own proves only that the caller is *some* enrolled participant.
 * The payment names its sender separately, so without this an attacker holding a leaked accessKey
 * for one DFSP plus their own legitimate certificate for another transacts as the first. Binding
 * the two forces compromise of both credentials of the same tenant, which is the whole reason to
 * layer mutual TLS on a signature scheme that already works.
 *
 * **Every failure path rejects.** No header, an unreadable header, a fingerprint matching no row,
 * a withdrawn or lapsed certificate, or a mismatch — all refused. A lookup miss must never read as
 * permission: the row is the only record that a certificate was ever issued, so its absence means
 * this deployment did not issue the certificate being presented.
 */
export class DfspCertificateGuard implements CanActivate {

    private readonly logger = new Logger(DfspCertificateGuard.name);

    constructor(
        private readonly certificates: ParticipantCertRepository,
        private readonly enabled: boolean,
        private readonly reflector: Reflector,
    ) {
    }

    /** Whether this leg requires a certificate, so the bootstrap can report it. */
    isEnabled(): boolean {
        return this.enabled;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {

        if (!this.enabled) {
            return true;
        }

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        const source = DfspCertificateGuard.readSource(request);
        const presented = Xfcc.parse(request.headers[Xfcc.HEADER_NAME] as string | undefined);

        if (presented == null) {
            // Either no proxy terminated mutual TLS for this request, or it did not describe the
            // certificate. Both mean the caller's transport identity is unknown.
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'No verified client certificate accompanied this request.',
            );
        }

        // Read per request rather than from a cache. One indexed lookup on a unique key buys
        // revocation that takes effect immediately instead of whenever a cache happens to turn
        // over, which is the difference between a screen that says "revoked" and an edge that
        // behaves as though it is.
        const certificate = await this.certificates.findByFingerprint(presented.hash);

        if (certificate == null) {
            this.logger.warn(
                `Rejected '${source}': certificate ${presented.hash.slice(0, 16)} is not one this `
                + 'deployment issued.',
            );

            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'The client certificate presented is not recognised.',
            );
        }

        DfspCertificateGuard.assertUsable(certificate, presented.hash, source, this.logger);

        if (certificate.fspId !== source) {
            // The finding this guard exists for. Logged at full detail because it is either an
            // attack or a misconfigured DFSP, and both need the operator to see both names.
            this.logger.error(
                `Rejected: certificate belongs to '${certificate.fspId}' but the request claims `
                + `fspiop-source '${source}'.`,
            );

            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'The client certificate does not belong to the participant named in fspiop-source.',
            );
        }

        return true;
    }

    private static readSource(request: Request): string {

        const raw = request.headers[FspiopHeaders.Names.FSPIOP_SOURCE];

        if (raw == null || String(raw).trim().length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-source.',
            );
        }

        return String(raw).trim();
    }

    /**
     * Rejects a certificate that resolved but must not be honoured.
     *
     * Validity is evaluated here rather than trusted from `status`, because expiry is a fact about
     * the clock that no process emits: a certificate is past its date the moment it passes, whether
     * or not anything has relabelled the row.
     */
    private static assertUsable(
        certificate: { fspId: string; status: string; validFrom: Date; validTo: Date },
        fingerprint: string,
        source: string,
        logger: Logger,
    ): void {

        if (certificate.status === ParticipantCertStatusCode.REVOKED) {
            logger.warn(`Rejected '${source}': certificate ${fingerprint.slice(0, 16)} is revoked.`);

            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'The client certificate presented has been revoked.',
            );
        }

        const now = Date.now();

        if (certificate.validTo.getTime() <= now || certificate.validFrom.getTime() > now) {
            logger.warn(
                `Rejected '${source}': certificate ${fingerprint.slice(0, 16)} is outside its `
                + 'validity period.',
            );

            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'The client certificate presented is not currently valid.',
            );
        }
    }
}
