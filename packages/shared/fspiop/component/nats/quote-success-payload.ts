// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import type {QuotesIDPutResponse} from '../../dto';
import type {OriginalIso20022QuoteResponsePayload} from '@shared/iso20022';

export type QuoteSuccessPayload = {
    response: QuotesIDPutResponse;
    iso20022QuoteResponse?: OriginalIso20022QuoteResponsePayload;
};
