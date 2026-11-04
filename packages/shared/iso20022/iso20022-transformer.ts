// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransformFacades} from '@mojaloop/ml-schema-transformer-lib';
import {FspiopHeadersMap} from '@shared/fspiop';

type Params = Record<string, string | undefined>;
const FSPIOP = TransformFacades.FSPIOP;
const FSPIOPISO20022 = TransformFacades.FSPIOPISO20022;

type FspiopBody = Parameters<typeof FSPIOP.quotes.post>[0]['body'];
type Iso20022Body = Parameters<typeof FSPIOPISO20022.quotes.post>[0]['body'];
// Pivotal stores headers as a generic map; the library validates routing headers at runtime.
type TransformerHeaders = Parameters<typeof FSPIOP.parties.put>[0]['headers'];
type TransformTarget<TBody = unknown> = {
    body?: TBody;
    headers?: FspiopHeadersMap;
    params?: Params;
};

export type OriginalIso20022PostQuotePayload = Record<string, unknown>;

export type OriginalIso20022QuoteResponsePayload = Record<string, unknown>;

export type Iso20022PutQuotesContext = {
    isoPostQuote: OriginalIso20022PostQuotePayload;
};

export type Iso20022PostTransfersContext = {
    isoPostQuoteResponse: OriginalIso20022QuoteResponsePayload;
};

export class Iso20022Transformer {
    static async fspiopPostQuotesToIso(body: FspiopBody): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.quotes.post({body}));
    }

    static async isoPostQuotesToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.quotes.post({body}));
    }

    static async fspiopPutQuotesToIso(
        id: string,
        body: FspiopBody,
        headers: FspiopHeadersMap,
        context?: Iso20022PutQuotesContext,
    ): Promise<unknown> {
        return Iso20022Transformer.bodyOf(
            await FSPIOP.quotes.put({body, headers: headers as TransformerHeaders, params: {ID: id}, $context: context}),
        );
    }

    static async isoPutQuotesToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.quotes.put({body}));
    }

    static async fspiopPutQuotesErrorToIso(body: FspiopBody): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.quotes.putError({body}));
    }

    static async isoPutQuotesErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.quotes.putError({body}));
    }

    static async fspiopPostTransfersToIso(
        body: FspiopBody,
        headers: FspiopHeadersMap,
        context?: Iso20022PostTransfersContext,
    ): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.transfers.post({body, headers: headers as TransformerHeaders, $context: context}));
    }

    static async isoPostTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.transfers.post({body}));
    }

    static async fspiopPutTransfersToIso(body: FspiopBody): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.transfers.put({body}));
    }

    static async isoPutTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.transfers.put({body}));
    }

    static async fspiopPatchTransfersToIso(body: FspiopBody): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.transfers.patch({body}));
    }

    static async isoPatchTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.transfers.patch({body}));
    }

    static async fspiopPutTransfersErrorToIso(body: FspiopBody): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOP.transfers.putError({body}));
    }

    static async isoPutTransfersErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.transfers.putError({body}));
    }

    static async fspiopPutPartiesToIso(
        type: string,
        id: string,
        subId: string | undefined,
        body: FspiopBody,
        headers: FspiopHeadersMap,
    ): Promise<unknown> {
        const source: Parameters<typeof FSPIOP.parties.put>[0] = {
            body,
            headers: headers as TransformerHeaders,
            params: {
                Type: type,
                ID: id,
                SubId: subId,
            },
        };

        return Iso20022Transformer.bodyOf(await FSPIOP.parties.put(source));
    }

    static async isoPutPartiesToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(
            await FSPIOPISO20022.parties.put({body}),
            'FSPIOPISO20022.parties.put',
            body,
        );
    }

    static async fspiopPutPartiesErrorToIso(
        type: string,
        id: string,
        subId: string | undefined,
        body: FspiopBody,
        headers: FspiopHeadersMap,
    ): Promise<unknown> {
        const source: Parameters<typeof FSPIOP.parties.putError>[0] = {
            body,
            headers: headers as TransformerHeaders,
            params: {
                Type: type,
                ID: id,
                SubId: subId,
            },
        };

        return Iso20022Transformer.bodyOf(await FSPIOP.parties.putError(source));
    }

    static async isoPutPartiesErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return Iso20022Transformer.bodyOf(await FSPIOPISO20022.parties.putError({body}));
    }

    private static bodyOf<TBody>(target: TransformTarget<TBody> | undefined, operation = 'unknown', source?: unknown): TBody {
        if (target == null) {
            throw new Error(
                `ISO20022 transform ${operation} returned no target body.`,
            );
        }

        return target.body as TBody;
    }
}
