// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Controller, Get} from '@nestjs/common';
import {PermissionKey, RequiresPermission, ROLE_PRESETS} from '@core/auth/domain';
import {RolePresetResponseDto} from '../../dto/admin';

@Controller('admin/role-presets')
export class RolePresetsAdminController {

    @Get()
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    list(): RolePresetResponseDto[] {
        return ROLE_PRESETS.map((preset) => new RolePresetResponseDto(
            preset.key,
            preset.label,
            preset.description,
            preset.scope,
            [...preset.permissionKeys],
        ));
    }
}
