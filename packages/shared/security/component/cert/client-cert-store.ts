// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ClientCert} from './client-cert';

export abstract class ClientCertStore {

    abstract load(): ClientCertStore;

    abstract get(): ClientCert | undefined;
}
