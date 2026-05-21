import {Column, Entity, PrimaryColumn} from 'typeorm';

@Entity({name: 'role_permissions'})
export class RolePermission {

    @PrimaryColumn({type: 'bigint', name: 'role_id'})
    public roleId: string;

    @PrimaryColumn({type: 'bigint', name: 'permission_id'})
    public permissionId: string;

    @Column({type: 'datetime', name: 'granted_at'})
    public grantedAt!: Date;

    constructor(roleId: string, permissionId: string) {
        this.roleId = roleId;
        this.permissionId = permissionId;
    }
}
