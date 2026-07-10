// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {RoleScope} from '@core/auth/domain';

export class RolePresetResponseDto {

    constructor(
        public readonly key:            string,
        public readonly label:          string,
        public readonly description:    string,
        public readonly scope:          RoleScope,
        public readonly permissionKeys: string[],
    ) {
    }
}
