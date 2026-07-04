// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Injectable, Logger} from '@nestjs/common';
import {DbTarget} from '@shared/typeorm';
import {ADMIN_ROLE_CODE, User} from '../model';
import {RoleRepository, UserRepository} from '../repository';
import {AUTH_DOMAIN_REQUIRED_SETTINGS, AuthDomainSettings, PasswordService} from '../service';

export interface AdminUserSeedResult {
    inserted: boolean;
    email:    string;
}

@Injectable()
export class AdminUserSeeder {

    private static readonly LOGGER = new Logger(AdminUserSeeder.name);

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(PasswordService)
        private readonly passwordService: PasswordService,
        @Inject(AUTH_DOMAIN_REQUIRED_SETTINGS)
        private readonly settings: AuthDomainSettings,
    ) {
    }

    async seed(): Promise<AdminUserSeedResult> {

        const existingUsers = await this.userRepository.count(DbTarget.Write);

        if (existingUsers > 0) {
            AdminUserSeeder.LOGGER.log(`Users table already populated (${existingUsers} rows); skipping admin seed.`);
            return {inserted: false, email: ''};
        }

        const email = this.settings.adminSeedEmail();
        const tempPassword = this.settings.adminSeedTempPassword();

        const adminRole = await this.roleRepository.findByCode(ADMIN_ROLE_CODE, DbTarget.Write);

        if (adminRole == null) {
            throw new Error(
                `Cannot seed admin user: '${ADMIN_ROLE_CODE}' role not found. Ensure RoleSeeder runs before AdminUserSeeder.`,
            );
        }

        const passwordHash = await this.passwordService.hash(tempPassword);
        const adminUser = new User(email, passwordHash, adminRole.id, null, true);

        await this.userRepository.save(adminUser);

        AdminUserSeeder.LOGGER.log(`Seeded admin user '${email}' (must_change_password=true).`);
        AdminUserSeeder.LOGGER.warn(
            'The seeded temporary password is valid for one login. Change it immediately and rotate the PIVOTAL_IAM_ADMIN_SEED_TEMP_PASSWORD env var.',
        );

        return {inserted: true, email};
    }
}
