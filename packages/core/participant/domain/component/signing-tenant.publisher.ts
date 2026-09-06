// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {SigningTenantProvisionedMessage} from '@core/trust/common';
import {NatsClientService} from '@shared/nats';

/**
 * Announces a newly provisioned signing tenant, so its public key reaches MCM without onboarding
 * waiting for it.
 *
 * **Onboarding must not call MCM.** A registry being unreachable is not a reason to refuse to
 * onboard a participant, and a synchronous call would make it one. Publishing to JetStream instead
 * means the work is durable: trust-manager picks it up when it can, and an MCM outage produces
 * redelivery rather than loss.
 *
 * **A failure here does not fail onboarding.** The tenant and its key already exist and are correct;
 * only the announcement is missing, and trust-manager's periodic reconcile finds that case anyway.
 * Rolling back a completed onboarding because a message could not be sent would trade a delay for
 * a much worse outcome.
 */
export class SigningTenantPublisher {

    static readonly SUBJECT = 'trust.signing-tenant.provisioned';

    private readonly logger = new Logger(SigningTenantPublisher.name);

    constructor(private readonly nats: NatsClientService) {
    }

    async publish(fspId: string): Promise<void> {

        try {
            const js = this.nats.nc.jetstream();

            await js.publish(
                SigningTenantPublisher.SUBJECT,
                this.nats.codec.encode(new SigningTenantProvisionedMessage(fspId)),
            );

            this.logger.log(`Announced '${fspId}' as a signing tenant awaiting publication.`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            // Warned rather than thrown. The reconcile in trust-manager exists for exactly this,
            // so the consequence is that the tenant is published on the next sweep instead of in
            // the next second.
            this.logger.warn(
                `Could not announce signing tenant '${fspId}': ${message}. Its key will be `
                + 'published by the periodic reconcile instead.',
            );
        }
    }
}
