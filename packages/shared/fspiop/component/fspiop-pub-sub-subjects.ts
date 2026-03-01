import {PartyIdType} from '../dto/party-id-type';

/**
 * Builds NATS subject strings for FSPIOP pub/sub messaging.
 *
 * Convention:
 *   forSuccess — subject for the success callback message.
 *                "<resource>:<payer>:<payee>:..."
 *
 *   forError   — subject for the error callback message.
 *                "<resource>-error:<payer>:<payee>:..."
 *
 * Example (Parties lookup):
 *   publish on  → Parties.forSuccess('DFSP-A', 'DFSP-B', PartyIdType.Msisdn, '0612345678')
 *                 "parties:DFSP-A:DFSP-B:MSISDN:0612345678"
 *
 *   subscribe on → Parties.forError('DFSP-A', 'DFSP-B', PartyIdType.Msisdn, '0612345678')
 *                  "parties-error:DFSP-A:DFSP-B:MSISDN:0612345678"
 */
export class FspiopPubSubSubjects {
}

export namespace FspiopPubSubSubjects {

    export class Parties {

        private constructor() {
        }

        /**
         * Success callback subject for a party lookup.
         * e.g. "parties:DFSP-A:DFSP-B:MSISDN:0612345678"
         *      "parties:DFSP-A:DFSP-B:MSISDN:0612345678:passport123"  (with subId)
         */
        static forSuccess(
            payer: string,
            payee: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            const base = `parties:${payer}:${payee}:${partyIdType}:${partyId}`;
            return subId != null && subId.length > 0 ? `${base}:${subId}` : base;
        }

        /**
         * Error callback subject for a party lookup.
         * e.g. "parties-error:DFSP-A:DFSP-B:MSISDN:0612345678"
         *      "parties-error:DFSP-A:DFSP-B:MSISDN:0612345678:passport123"  (with subId)
         */
        static forError(
            payer: string,
            payee: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            const base = `parties-error:${payer}:${payee}:${partyIdType}:${partyId}`;
            return subId != null && subId.length > 0 ? `${base}:${subId}` : base;
        }
    }

    export class Quotes {

        private constructor() {
        }

        /**
         * Success callback subject for a quote.
         * e.g. "quotes:DFSP-A:DFSP-B:quote-uuid"
         */
        static forSuccess(payer: string, payee: string, quoteId: string): string {
            return `quotes:${payer}:${payee}:${quoteId}`;
        }

        /**
         * Error callback subject for a quote.
         * e.g. "quotes-error:DFSP-A:DFSP-B:quote-uuid"
         */
        static forError(payer: string, payee: string, quoteId: string): string {
            return `quotes-error:${payer}:${payee}:${quoteId}`;
        }
    }

    export class Transfers {

        private constructor() {
        }

        /**
         * Success callback subject for a transfer.
         * e.g. "transfers:DFSP-A:DFSP-B:transfer-uuid"
         */
        static forSuccess(payer: string, payee: string, transferId: string): string {
            return `transfers:${payer}:${payee}:${transferId}`;
        }

        /**
         * Error callback subject for a transfer.
         * e.g. "transfers-error:DFSP-A:DFSP-B:transfer-uuid"
         */
        static forError(payer: string, payee: string, transferId: string): string {
            return `transfers-error:${payer}:${payee}:${transferId}`;
        }
    }
}
