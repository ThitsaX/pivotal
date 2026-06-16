import {PartyIdType} from '../dto/party-id-type';

/**
 * Builds NATS JetStream subject strings for FSPIOP response correlation.
 *
 * All subjects share the `pivotal.fspiop.response.` prefix so they route into a single
 * JetStream stream (PIVOTAL_FSPIOP_RESPONSE). The prefix is deliberately *outside* the
 * `fspiop.*` namespace used by connector teams for their command stream — it prevents
 * a JetStream subject-overlap collision and means external connector implementations
 * (pivotal-connector-nestjs, pivotal-connector-java, etc.) need zero awareness of this
 * channel.
 *
 * The token following the prefix encodes the resource and outcome (`parties`,
 * `parties-error`, `quotes`, `quotes-error`, `transfers`, `transfers-error`). The
 * remainder uniquely identifies the in-flight request:
 *
 *   - Parties:   payer:payee:partyIdType:partyId[:subId]
 *     (Parties callbacks are addressed by FSPIOP resource path, not by a transaction id,
 *      so two concurrent waiters on the same tuple both receive the message — preserved
 *      by giving each outbound replica its own JetStream consumer.)
 *
 *   - Quotes / Transfers: payer:{quoteId|transferId}
 *     (Already unique per request.)
 *
 * Example:
 *   forSuccess('DFSP-A', 'DFSP-B', PartyIdType.Msisdn, '0612345678')
 *     → "pivotal.fspiop.response.parties:DFSP-A:DFSP-B:MSISDN:0612345678"
 */
export class FspiopPubSubSubjects {
}

export namespace FspiopPubSubSubjects {

    const PREFIX = 'pivotal.fspiop.response.';

    export class Parties {

        private constructor() {
        }

        static forSuccess(
            payer: string,
            payee: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            const base = `${PREFIX}parties:${payer}:${payee}:${partyIdType}:${partyId}`;
            return subId != null && subId.length > 0 ? `${base}:${subId}` : base;
        }

        static forError(
            payer: string,
            payeeOrHub: string,
            partyIdType: PartyIdType,
            partyId: string,
            subId?: string,
        ): string {
            const base = `${PREFIX}parties-error:${payer}:${payeeOrHub}:${partyIdType}:${partyId}`;
            return subId != null && subId.length > 0 ? `${base}:${subId}` : base;
        }
    }

    export class Quotes {

        private constructor() {
        }

        static forSuccess(payer: string, quoteId: string): string {
            return `${PREFIX}quotes:${payer}:${quoteId}`;
        }

        static forError(payer: string, quoteId: string): string {
            return `${PREFIX}quotes-error:${payer}:${quoteId}`;
        }
    }

    export class Transfers {

        private constructor() {
        }

        static forSuccess(payer: string, transferId: string): string {
            return `${PREFIX}transfers:${payer}:${transferId}`;
        }

        static forError(payer: string, transferId: string): string {
            return `${PREFIX}transfers-error:${payer}:${transferId}`;
        }
    }
}
