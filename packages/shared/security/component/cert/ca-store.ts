// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Ca} from './ca';

export abstract class CaStore {

    abstract load(): CaStore;

    abstract get(): Ca | undefined;
}
