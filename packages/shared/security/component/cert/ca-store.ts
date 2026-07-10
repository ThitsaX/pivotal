// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Ca} from './ca';

export abstract class CaStore {

    abstract load(): CaStore;

    abstract get(): Ca | undefined;
}
