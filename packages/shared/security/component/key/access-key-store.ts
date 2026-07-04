// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PublicKey} from './public-key';

export abstract class AccessKeyStore {

    abstract load(): AccessKeyStore;

    abstract get(fspId: string): PublicKey | undefined;
}
