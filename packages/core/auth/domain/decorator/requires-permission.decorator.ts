// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CustomDecorator, SetMetadata} from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'auth:requires-permission';

export const RequiresPermission = (permissionKey: string): CustomDecorator<string> =>
    SetMetadata(REQUIRES_PERMISSION_KEY, permissionKey);
