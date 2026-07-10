// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { PartyIdType } from '../dto/party-id-type';

function withBaseUrl(baseUrl: string, uri: string): string {
    return `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}${uri}`;
}

export class FspiopUrls {

    static newUrl(baseUrl: string, existingUri: string): string {

        const requireSeparator = !baseUrl.endsWith('/');
        const newUri = existingUri.startsWith('/') ? existingUri.substring(1) : existingUri;

        return requireSeparator ? `${baseUrl}/${newUri}` : `${baseUrl}${newUri}`;
    }
}

export namespace FspiopUrls {

    export class Parties {

        static getParties(
            baseUrl: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            if (subId == null) {
                return withBaseUrl(baseUrl, `parties/${partyIdType}/${partyId}`);
            }

            return withBaseUrl(baseUrl, `parties/${partyIdType}/${partyId}/${subId}`);
        }

        static putParties(
            baseUrl: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            if (subId == null) {
                return withBaseUrl(baseUrl, `parties/${partyIdType}/${partyId}`);
            }

            return withBaseUrl(baseUrl, `parties/${partyIdType}/${partyId}/${subId}`);
        }

        static putPartiesError(
            baseUrl: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string | null,
        ): string {
            const resolvedSubId = subId != null ? `/${subId}` : '';
            return withBaseUrl(baseUrl, `parties/${partyIdType}/${partyId}${resolvedSubId}/error`);
        }
    }

    export class Quotes {

        static getQuotes(baseUrl: string, quoteId: string): string {
            return withBaseUrl(baseUrl, `quotes/${quoteId}`);
        }

        static postQuotes(baseUrl: string): string {
            return withBaseUrl(baseUrl, 'quotes');
        }

        static putQuotes(baseUrl: string, quoteId: string): string {
            return withBaseUrl(baseUrl, `quotes/${quoteId}`);
        }

        static putQuotesError(baseUrl: string, quoteId: string): string {
            return withBaseUrl(baseUrl, `quotes/${quoteId}/error`);
        }
    }

    export class Transfers {

        static getTransfers(baseUrl: string, transferId: string): string {
            return withBaseUrl(baseUrl, `transfers/${transferId}`);
        }

        static patchTransfers(baseUrl: string, transferId: string): string {
            return withBaseUrl(baseUrl, `transfers/${transferId}`);
        }

        static postTransfers(baseUrl: string): string {
            return withBaseUrl(baseUrl, 'transfers');
        }

        static putTransfers(baseUrl: string, transferId: string): string {
            return withBaseUrl(baseUrl, `transfers/${transferId}`);
        }

        static putTransfersError(baseUrl: string, transferId: string): string {
            return withBaseUrl(baseUrl, `transfers/${transferId}/error`);
        }
    }
}
