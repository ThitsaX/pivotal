// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PrivateKey} from './private-key';

export abstract class PrivateKeyStore {

    abstract load(): PrivateKeyStore;

    abstract get(fspId: string): PrivateKey | undefined;
}
