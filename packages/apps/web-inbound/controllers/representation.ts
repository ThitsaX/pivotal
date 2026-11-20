// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {FspiopSettings} from '@shared/fspiop';
import {ApiType} from '@shared/iso20022/api-type';
import {Iso20022ContentType} from '@shared/iso20022/iso20022-content-type';

export class InboundRepresentation {
    static isIso20022(
        settings: FspiopSettings,
        contentTypeHeader: string | string[] | undefined,
    ): boolean {
        return settings.apiType === ApiType.ISO20022
            && Iso20022ContentType.isIso20022(contentTypeHeader);
    }
}
