// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {RoleScope} from '@core/auth/domain';

export class RoleResponseDto {

    constructor(
        public readonly id:              string,
        public readonly code:            string,
        public readonly name:            string,
        public readonly description:     string | null,
        public readonly scope:           RoleScope,
        public readonly isSystem:        boolean,
        public readonly userCount:       number,
        public readonly permissionCount: number,
    ) {
    }
}

export class RolePermissionsResponseDto {

    constructor(
        public readonly permissionKeys: string[],
    ) {
    }
}
