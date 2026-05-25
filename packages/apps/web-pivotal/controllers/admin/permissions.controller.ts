import {Controller, Get, Inject} from '@nestjs/common';
import {PermissionKey, PermissionRepository, RequiresPermission} from '@core/auth/domain';
import {PermissionListResponseDto, PermissionResponseDto} from '../../dto/admin';

@Controller('admin/permissions')
export class PermissionsAdminController {

    constructor(
        @Inject(PermissionRepository)
        private readonly permissionRepository: PermissionRepository,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.ADMIN_PERMISSIONS_LIST)
    async list(): Promise<PermissionListResponseDto> {

        const permissions = await this.permissionRepository.findAll();

        return new PermissionListResponseDto(
            permissions.map((p) => new PermissionResponseDto(p.id, p.keyName, p.description, p.scope)),
        );
    }
}
