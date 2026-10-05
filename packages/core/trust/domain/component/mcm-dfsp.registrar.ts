// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {McmAxios, PostDfspRequest} from '@shared/mcm-client';

/**
 * Makes sure MCM knows a DFSP before anything is registered under it.
 *
 * Every other registration -- a tenant's signing key, Pivotal's CA, Pivotal's own certificates --
 * is made under a DFSP, and MCM refuses all of them with a 404 until that DFSP exists. Creating it
 * was a separate manual step that onboarding could not see, so a missed one surfaced only as a
 * background job failing, hourly, long after the onboarding that should have done it.
 *
 * Called ahead of those registrations rather than on a schedule of its own, so the DFSP always
 * exists by the time something needs it, whichever path gets there first.
 *
 * Off unless switched on: where the Hub is operated by someone else, MCM's list of DFSPs is theirs
 * to keep, and Pivotal adding to it would be overstepping.
 */
export class McmDfspRegistrar {

    private readonly logger = new Logger(McmDfspRegistrar.name);

    /**
     * DFSPs confirmed to exist. MCM does not delete a DFSP on its own, so once confirmed there is
     * nothing to re-check, and every later call for it costs nothing.
     */
    private readonly known = new Set<string>();

    constructor(
        private readonly mcm: McmAxios,
        private readonly settings: McmDfspRegistrar.Settings,
    ) {}

    async ensureRegistered(dfspId: string): Promise<McmDfspRegistrar.Outcome> {
        if (!this.settings.enabled) {
            return 'disabled';
        }

        if (this.known.has(dfspId)) {
            return 'present';
        }

        if (await this.exists(dfspId)) {
            return 'present';
        }

        try {
            await this.mcm.createDfsp(this.request(dfspId));
        } catch (error: unknown) {
            // Two replicas, or the event and the sweep, can reach a new DFSP at the same moment, and
            // the slower create is refused. What matters is that the DFSP exists, not who made it.
            if (await this.exists(dfspId)) {
                return 'present';
            }

            throw error;
        }

        this.known.add(dfspId);
        this.logger.log(`Registered '${dfspId}' as a DFSP in MCM.`);

        return 'created';
    }

    /**
     * Read from MCM's full list rather than by id: MCM v3.7 has no `GET /dfsps/{dfspId}`. Every DFSP
     * on the list is remembered while it is at hand, so one read answers for all of them and a sweep
     * over many tenants costs a single request.
     */
    private async exists(dfspId: string): Promise<boolean> {
        for (const dfsp of await this.mcm.listDfsps()) {
            const id = dfsp.id ?? dfsp.dfspId;

            if (id != null && id.length > 0) {
                this.known.add(id);
            }
        }

        return this.known.has(dfspId);
    }

    private request(dfspId: string): PostDfspRequest {
        return {
            dfspId,
            name: dfspId,
            ...(this.settings.contactEmail == null ? {} : {email: this.settings.contactEmail}),
            ...(this.settings.monetaryZoneId == null ? {} : {monetaryZoneId: this.settings.monetaryZoneId}),
        };
    }
}

export namespace McmDfspRegistrar {

    export type Outcome = 'disabled' | 'present' | 'created';

    export interface Settings {
        enabled: boolean;
        /**
         * Sent only when set. MCM requires it where it creates a Keycloak account for each new
         * DFSP, and ignores it otherwise.
         */
        contactEmail?: string;
        /**
         * Sent only when set. Pivotal holds no currency per tenant, and MCM uses this only when it
         * provisions the DFSP in the Hub's ledger, which onboarding Pivotal's DFSPs does not do.
         */
        monetaryZoneId?: string;
    }
}
