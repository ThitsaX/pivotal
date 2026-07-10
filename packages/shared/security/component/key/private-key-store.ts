// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PrivateKey} from './private-key';

export abstract class PrivateKeyStore {

    abstract load(): PrivateKeyStore;

    abstract get(fspId: string): PrivateKey | undefined;
}
