// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Injectable} from '@nestjs/common';
import {Currency} from '@shared/fspiop';

@Injectable()
export class ConnectorSettings {
    constructor(
        public readonly connectorId: string,
        public readonly supportedCurrencies: Currency[],
        public readonly ilpSecret: string,
    ) {
    }

    isCurrencySupported(currency: Currency): boolean {
        return this.supportedCurrencies.includes(currency);
    }
}
