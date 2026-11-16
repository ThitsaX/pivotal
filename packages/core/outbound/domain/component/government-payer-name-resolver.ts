// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FspParty } from '../dto';
import { GovernmentPayerDisplayNameStore } from './government-payer-display-name-store';

/**
 * Fills a blank payer name on a government-to-person transfer from the name
 * configured for the sending DFSP.
 *
 * The lookup key is the FSPIOP source. A field on the request body is never
 * used, because a caller could set one to impersonate another DFSP. A name
 * the sender already sent is kept. A DFSP with nothing configured is left
 * unchanged, and the transfer is never rejected for that.
 */
@Injectable()
export class GovernmentPayerNameResolver {

    private static readonly GOVERNMENT_TO_PERSON = 'GOVERNMENT_TO_PERSON';

    private static readonly GOVERNMENT_TO_PERSON_PREFIX = 'GOVERNMENT_TO_PERSON_';

    private readonly logger = new Logger(GovernmentPayerNameResolver.name);

    constructor(
        @Inject(GovernmentPayerDisplayNameStore)
        private readonly store: GovernmentPayerDisplayNameStore,
    ) {
    }

    resolve(source: string, from: FspParty, subScenario: string | undefined): FspParty {
        if (!GovernmentPayerNameResolver.isGovernmentToPerson(subScenario)) {
            return from;
        }

        if (!GovernmentPayerNameResolver.isBlank(from.displayName)) {
            return from;
        }

        const displayName = this.store.get(source);

        if (displayName == null) {
            this.logger.debug(
                `No government payer display name is configured for '${source}'. The payer name is left unchanged.`,
            );
            return from;
        }

        return GovernmentPayerNameResolver.copyWithDisplayName(from, displayName);
    }

    private static isGovernmentToPerson(subScenario: string | undefined): boolean {
        const value = subScenario?.trim();

        if (value == null || value.length === 0) {
            return false;
        }

        return value === GovernmentPayerNameResolver.GOVERNMENT_TO_PERSON
            || value.startsWith(GovernmentPayerNameResolver.GOVERNMENT_TO_PERSON_PREFIX);
    }

    private static isBlank(displayName: string | undefined): boolean {
        return displayName == null || displayName.trim().length === 0;
    }

    private static copyWithDisplayName(from: FspParty, displayName: string): FspParty {
        const copy = Object.assign(new FspParty(), from);
        copy.displayName = displayName;
        return copy;
    }
}
