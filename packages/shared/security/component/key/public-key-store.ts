// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PublicKey} from './public-key';

export abstract class PublicKeyStore {

    abstract load(): PublicKeyStore;

    abstract get(fspId: string): PublicKey | undefined;
}
