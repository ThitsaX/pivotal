// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ClientCert} from './client-cert';

export abstract class ClientCertStore {

    abstract load(): ClientCertStore;

    abstract get(): ClientCert | undefined;
}
