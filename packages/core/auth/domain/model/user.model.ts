import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'users'})
@Index('users_01_uk_email', ['email'], {unique: true})
@Index('users_02_idx_role_id', ['roleId'])
@Index('users_03_idx_fsp_id', ['fspId'])
export class User {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 255, name: 'email'})
    public email: string;

    @Column({type: 'varchar', length: 255, name: 'password_hash'})
    public passwordHash: string;

    @Column({type: 'varchar', length: 64, name: 'fsp_id', nullable: true})
    public fspId: string | null;

    @Column({type: 'bigint', name: 'role_id'})
    public roleId: string;

    @Column({type: 'boolean', name: 'must_change_password', default: true})
    public mustChangePassword: boolean;

    @Column({type: 'boolean', name: 'is_active', default: true})
    public isActive: boolean;

    @Column({type: 'int', name: 'failed_login_attempts', default: 0})
    public failedLoginAttempts: number;

    @Column({type: 'datetime', name: 'locked_until', nullable: true})
    public lockedUntil: Date | null;

    @Column({type: 'datetime', name: 'last_login_at', nullable: true})
    public lastLoginAt: Date | null;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @Column({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;

    constructor(
        email: string,
        passwordHash: string,
        roleId: string,
        fspId: string | null = null,
        mustChangePassword: boolean = true,
        id?: string,
    ) {
        if (id !== undefined) {
            this.id = id;
        }
        this.email = email;
        this.passwordHash = passwordHash;
        this.roleId = roleId;
        this.fspId = fspId;
        this.mustChangePassword = mustChangePassword;
        this.isActive = true;
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
        this.lastLoginAt = null;
    }

    @BeforeInsert()
    assignId(): void {
        if (this.id == null) {
            this.id = User.SNOWFLAKE.nextId().toString();
        }
    }
}
