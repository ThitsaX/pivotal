// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiType} from './api-type';

export enum Iso20022Resource {
    Parties = 'parties',
    Quotes = 'quotes',
    Transfers = 'transfers',
}

const FSPIOP_MEDIA_TYPES: Readonly<Record<Iso20022Resource, string>> = {
    [Iso20022Resource.Parties]: 'application/vnd.interoperability.parties+json;version=2.0',
    [Iso20022Resource.Quotes]: 'application/vnd.interoperability.quotes+json;version=2.0',
    [Iso20022Resource.Transfers]: 'application/vnd.interoperability.transfers+json;version=2.0',
};

const ISO20022_MEDIA_TYPES: Readonly<Record<Iso20022Resource, string>> = {
    [Iso20022Resource.Parties]: 'application/vnd.interoperability.iso20022.parties+json;version=2.0',
    [Iso20022Resource.Quotes]: 'application/vnd.interoperability.iso20022.quotes+json;version=2.0',
    [Iso20022Resource.Transfers]: 'application/vnd.interoperability.iso20022.transfers+json;version=2.0',
};

export class Iso20022ContentType {
    static forResource(resource: Iso20022Resource, apiType: ApiType): string {
        return apiType === ApiType.ISO20022
            ? ISO20022_MEDIA_TYPES[resource]
            : FSPIOP_MEDIA_TYPES[resource];
    }

    static isIso20022(value: string | string[] | undefined): boolean {
        const candidate = Array.isArray(value) ? value[0] : value;
        return candidate?.toLowerCase().includes('iso20022') ?? false;
    }
}
