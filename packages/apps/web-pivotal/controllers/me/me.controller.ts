import {Controller, Get, Inject, UnauthorizedException} from '@nestjs/common';
import {AccessTokenClaims, MenuRepository, UserRepository} from '@core/auth/domain';
import {DbTarget} from '@shared/typeorm';
import {AuthUser} from '../../decorators';
import {MeResponseDto, MeUserDto, MenuGroupDto, MenuItemDto, MenuResponseDto} from '../../dto/me';

@Controller('auth/me')
export class MeController {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
    ) {
    }

    @Get()
    async me(@AuthUser() claims: AccessTokenClaims | undefined): Promise<MeResponseDto> {

        if (claims == null) {
            throw new UnauthorizedException({code: 'AUTH_NO_SESSION', message: 'No active session.'});
        }

        const user = await this.userRepository.findById(claims.sub);

        if (user == null) {
            throw new UnauthorizedException({code: 'AUTH_NO_SESSION', message: 'No active session.'});
        }

        return new MeResponseDto(
            new MeUserDto(
                user.id,
                user.email,
                claims.role,
                claims.fspId,
            ),
            claims.permissions,
            claims.mustChangePassword,
        );
    }

    @Get('menu')
    async menu(@AuthUser() claims: AccessTokenClaims | undefined): Promise<MenuResponseDto> {

        if (claims == null) {
            throw new UnauthorizedException({code: 'AUTH_NO_SESSION', message: 'No active session.'});
        }

        if (claims.permissions.length === 0) {
            return new MenuResponseDto([]);
        }

        const menus = await this.menuRepository.findActiveByPermissionKeys(claims.permissions, DbTarget.Read);

        const groupedByLabel = new Map<string, MenuItemDto[]>();

        for (const menu of menus) {

            const item = new MenuItemDto(menu.menuKey, menu.label, menu.route, menu.icon, menu.sortOrder);

            const existing = groupedByLabel.get(menu.groupLabel);

            if (existing != null) {
                existing.push(item);
            } else {
                groupedByLabel.set(menu.groupLabel, [item]);
            }
        }

        const groups: MenuGroupDto[] = [];

        for (const [label, items] of groupedByLabel.entries()) {
            groups.push(new MenuGroupDto(label, items));
        }

        return new MenuResponseDto(groups);
    }
}
