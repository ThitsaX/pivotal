import {Entity, PrimaryColumn} from 'typeorm';

@Entity({name: 'menu_permissions'})
export class MenuPermission {

    @PrimaryColumn({type: 'bigint', name: 'menu_id'})
    public menuId: string;

    @PrimaryColumn({type: 'bigint', name: 'permission_id'})
    public permissionId: string;

    constructor(menuId: string, permissionId: string) {
        this.menuId = menuId;
        this.permissionId = permissionId;
    }
}
