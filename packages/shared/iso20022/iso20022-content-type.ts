// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiType} from './api-type';
import {FspiopException} from '../fspiop/exception/fspiop-exception';
import {FspiopErrors} from '../fspiop/exception/fspiop-errors';

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
        if (typeof value !== 'string') {
            return false;
        }
        try {
            const parsed = this.parse(value, false);
            return Object.values(ISO20022_MEDIA_TYPES).some(type =>
                parsed.mediaType === type.split(';')[0])
                && parsed.parameters.get('version') === '2.0';
        } catch {
            return false;
        }
    }

    static validateHeaders(
        resource: Iso20022Resource,
        apiType: ApiType,
        method: string,
        contentType: string | string[] | undefined,
        accept: string | string[] | undefined,
    ): void {
        const expected = this.forResource(resource, apiType).split(';')[0];
        const versions = apiType === ApiType.ISO20022 ? ['2.0'] : ['1.0', '1.1', '2.0'];
        const requiresBody = ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());

        if (contentType === undefined) {
            if (requiresBody) {
                throw new FspiopException(FspiopErrors.MISSING_MANDATORY_ELEMENT, 'Content-Type is required.');
            }
        } else {
            if (typeof contentType !== 'string') {
                throw this.invalid('Content-Type');
            }
            const parsed = this.parse(contentType, false);
            if (parsed.mediaType !== expected) {
                throw this.invalid('Content-Type');
            }
            if (!versions.includes(parsed.parameters.get('version') ?? '')) {
                throw new FspiopException(FspiopErrors.UNACCEPTABLE_VERSION_REQUESTED, 'Unsupported Content-Type version.');
            }
        }

        const requiresAccept = ['GET', 'POST', 'DELETE'].includes(method.toUpperCase());
        if (accept === undefined) {
            if (requiresAccept) {
                throw new FspiopException(FspiopErrors.MISSING_MANDATORY_ELEMENT, 'Accept is required.');
            }
            return;
        }

        const entries = (Array.isArray(accept) ? accept.join(',') : accept)
            .split(',').map(value => this.parse(value, true));
        if (entries.some(entry => entry.mediaType !== expected)) {
            throw this.invalid('Accept');
        }
        const acceptedVersions = new Set([...versions, ...versions.map(version => version.split('.')[0])]);
        if (!entries.some(entry => acceptedVersions.has(entry.parameters.get('version') ?? '')
            && Number(entry.parameters.get('q') ?? '1') > 0)) {
            throw new FspiopException(FspiopErrors.UNACCEPTABLE_VERSION_REQUESTED, 'Unsupported Accept version.');
        }
    }

    private static parse(value: string, isAccept: boolean): {mediaType: string; parameters: Map<string, string>} {
        const [type, ...parts] = value.split(';');
        const mediaType = type.trim().toLowerCase();
        if (!/^application\/vnd\.interoperability\.(?:iso20022\.)?(?:parties|quotes|transfers)\+json$/.test(mediaType)) {
            throw this.invalid(isAccept ? 'Accept' : 'Content-Type');
        }
        const parameters = new Map<string, string>();
        for (const part of parts) {
            const match = /^\s*([a-z]+)\s*=\s*(?:"([a-z0-9.-]+)"|([a-z0-9.-]+))\s*$/i.exec(part);
            if (!match) {
                throw this.invalid(isAccept ? 'Accept' : 'Content-Type');
            }
            const name = match[1].toLowerCase();
            const parameter = (match[2] ?? match[3]).toLowerCase();
            if (parameters.has(name)
                || !['version', 'charset', ...(isAccept ? ['q'] : [])].includes(name)
                || (name === 'version' && !/^\d+(?:\.\d+)?$/.test(parameter))
                || (name === 'charset' && parameter !== 'utf-8')
                || (name === 'q' && !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(parameter))) {
                throw this.invalid(isAccept ? 'Accept' : 'Content-Type');
            }
            parameters.set(name, parameter);
        }
        return {mediaType, parameters};
    }

    private static invalid(header: string): FspiopException {
        return new FspiopException(FspiopErrors.MALFORMED_SYNTAX, `Invalid ${header} for the configured API mode and resource.`);
    }
}
