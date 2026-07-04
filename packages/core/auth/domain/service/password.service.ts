// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Injectable} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {AUTH_DOMAIN_REQUIRED_SETTINGS, AuthDomainSettings} from './auth-domain-settings';

@Injectable()
export class PasswordService {

    constructor(
        @Inject(AUTH_DOMAIN_REQUIRED_SETTINGS)
        private readonly settings: AuthDomainSettings,
    ) {
    }

    async hash(plaintext: string): Promise<string> {
        return bcrypt.hash(plaintext, this.settings.bcryptCostFactor());
    }

    async verify(plaintext: string, hash: string): Promise<boolean> {
        return bcrypt.compare(plaintext, hash);
    }
}
