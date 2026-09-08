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
 * **A presented certificate is always checked. The flag decides only what an absent one means.**
 *
 * | Presented | Not mandatory | Mandatory |
 * | --- | --- | --- |
 * | yes | verified in full | verified in full |
 * | no  | admitted         | rejected  |
 *
 * That split is what makes migration possible one DFSP at a time. A deployment-wide switch over
 * whether to check at all cannot express it: with the switch off an enrolled DFSP's certificate is
 * discarded unopened, so nobody is protected until the last participant is ready, and the day it is
 * turned on is the first time anyone learns whether each DFSP's setup works. Keying on what the
 * request actually carries lets each participant cut over when it chooses, contains a broken setup
 * to the one participant that has it, and reduces the flag to a statement that migration is done.
 *
 * Tolerating an absent certificate is not the same as tolerating a bad one. **Every failure path
 * past that point rejects**, mandatory or not: a fingerprint matching no row, a withdrawn or lapsed
 * certificate, or a mismatch. A caller that offers a credential is held to it — we issued it, so we
 * know whether it is still good, and admitting someone on a certificate we would otherwise refuse
 * is worse than never having asked. A lookup miss in particular must never read as permission: the
 * row is the only record that a certificate was ever issued, so its absence means this deployment
 * did not issue the one being presented.
 *
 * While certificates are not mandatory an enrolled DFSP can still decline to present one and be
 * admitted, so the endpoint that permits that must not be reachable outside the network control it
 * relies on. That is an ingress rule, not something this guard can enforce.
 */
export class DfspCertificateGuard implements CanActivate {

    private readonly logger = new Logger(DfspCertificateGuard.name);

    constructor(
        private readonly certificates: ParticipantCertRepository,
        private readonly mandatory: boolean,
        private readonly reflector: Reflector,
    ) {
    }

    /** Whether a caller may arrive without a certificate, so the bootstrap can report it. */
    isMandatory(): boolean {
        return this.mandatory;
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

        const presented = Xfcc.parse(request.headers[Xfcc.HEADER_NAME] as string | undefined);

        if (presented == null) {
            // Either no proxy terminated mutual TLS for this request, or it did not describe the
            // certificate. Both mean the caller's transport identity is unknown, and an unknown
            // identity is the one thing the flag governs.
            if (!this.mandatory) {
                return true;
            }

            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'No verified client certificate accompanied this request.',
            );
        }

        // Read after the admission above, so a caller that presents nothing is not refused here for
        // a header AccessGuard will demand a moment later anyway.
        const source = DfspCertificateGuard.readSource(request);

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
