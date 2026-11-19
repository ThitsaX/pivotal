// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ExecutionContext} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {WebInboundModule} from '../../../packages/apps/web-inbound/web-inbound.module';
import {ParticipantSigningKeysCache} from '../../../packages/core/participant/domain/component/store/participant-signing-keys-cache';
import {FspiopSettings} from '../../../packages/shared/fspiop/component/fspiop-settings';
import {FspiopVerifyMode} from '../../../packages/shared/fspiop/component/fspiop-verify-mode';
import {FspInboundGuard} from '../../../packages/shared/fspiop/component/nest/guard/fsp-inbound.guard';
import {ApiType} from '../../../packages/shared/iso20022/api-type';

describe('WebInbound JWS guard wiring', () => {
    for (const mode of [ApiType.FSPIOP, ApiType.ISO20022]) {
        for (const useJws of [true, false]) {
            it(`${mode}: ${useJws ? 'rejects' : 'accepts'} an unsigned body when JWS is ${useJws ? 'enabled' : 'disabled'}`, async () => {
                const settings = new FspiopSettings(
                    'hub', '', '', '', useJws, false, mode, false, FspiopVerifyMode.Require,
                );
                const definition = WebInboundModule.forRootAsync({
                    useFactory: () => ({
                        fspiopSettings: () => settings,
                    } as WebInboundModule.RequiredSettings),
                });
                // Use the application's actual providers, isolating database/NATS imports.
                const module = await Test.createTestingModule({
                    providers: [
                        ...(definition.providers ?? []),
                        {provide: ParticipantSigningKeysCache, useValue: {
                            getVerifyMode: () => undefined,
                        }},
                    ],
                }).compile();
                const context = {
                    switchToHttp: () => ({getRequest: () => ({
                        method: 'PUT',
                        headers: {'fspiop-source': 'payerfsp'},
                        body: {example: true},
                    })}),
                } as ExecutionContext;

                try {
                    const guard = module.get(FspInboundGuard);
                    if (useJws) {
                        assert.throws(
                            () => guard.canActivate(context),
                            /Missing mandatory header: fspiop-signature\./,
                        );
                    } else {
                        assert.equal(guard.canActivate(context), true);
                    }
                } finally {
                    await module.close();
                }
            });
        }
    }
});
