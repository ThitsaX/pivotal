// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {TransformFacades} from '@mojaloop/ml-schema-transformer-lib';
import {Injectable} from '@nestjs/common';
import type {FspiopHeadersMap} from '@shared/fspiop';
import {FspiopSettings} from '@shared/fspiop/component/fspiop-settings';

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

@Injectable()
export class Iso20022Transformer {
    constructor(private readonly settings: FspiopSettings) {}

    async fspiopPostQuotesToIso(body: FspiopBody): Promise<unknown> {
        return this.bodyOf(await FSPIOP.quotes.post({body}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPostQuotesToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.quotes.post({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPutQuotesToIso(
        id: string,
        body: FspiopBody,
        headers: FspiopHeadersMap,
        context?: Iso20022PutQuotesContext,
    ): Promise<unknown> {
        return this.bodyOf(
            await FSPIOP.quotes.put({body, headers: headers as TransformerHeaders, params: {ID: id}, $context: context}, {validateTarget: this.settings.validateTarget}),
        );
    }

    async isoPutQuotesToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.quotes.put({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPutQuotesErrorToIso(body: FspiopBody): Promise<unknown> {
        return this.bodyOf(await FSPIOP.quotes.putError({body}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPutQuotesErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.quotes.putError({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPostTransfersToIso(
        body: FspiopBody,
        headers: FspiopHeadersMap,
        context?: Iso20022PostTransfersContext,
    ): Promise<unknown> {
        return this.bodyOf(await FSPIOP.transfers.post({body, headers: headers as TransformerHeaders, $context: context}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPostTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.transfers.post({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPutTransfersToIso(body: FspiopBody): Promise<unknown> {
        return this.bodyOf(await FSPIOP.transfers.put({body}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPutTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.transfers.put({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPatchTransfersToIso(body: FspiopBody): Promise<unknown> {
        return this.bodyOf(await FSPIOP.transfers.patch({body}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPatchTransfersToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.transfers.patch({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPutTransfersErrorToIso(body: FspiopBody): Promise<unknown> {
        return this.bodyOf(await FSPIOP.transfers.putError({body}, {validateTarget: this.settings.validateTarget}));
    }

    async isoPutTransfersErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.transfers.putError({body}, {validateTarget: this.settings.validateTarget}));
    }

    async fspiopPutPartiesToIso(
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

        return this.bodyOf(await FSPIOP.parties.put(source, {validateTarget: this.settings.validateTarget}));
    }

    async isoPutPartiesToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(
            await FSPIOPISO20022.parties.put({body}, {validateTarget: this.settings.validateTarget}),
            'FSPIOPISO20022.parties.put',
            body,
        );
    }

    async fspiopPutPartiesErrorToIso(
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

        return this.bodyOf(await FSPIOP.parties.putError(source, {validateTarget: this.settings.validateTarget}));
    }

    async isoPutPartiesErrorToFspiop(body: Iso20022Body): Promise<unknown> {
        return this.bodyOf(await FSPIOPISO20022.parties.putError({body}, {validateTarget: this.settings.validateTarget}));
    }

    private bodyOf<TBody>(target: TransformTarget<TBody> | undefined, operation = 'unknown', source?: unknown): TBody {
        if (target == null) {
            throw new Error(
                `ISO20022 transform ${operation} returned no target body.`,
            );
        }

        return target.body as TBody;
    }
}
