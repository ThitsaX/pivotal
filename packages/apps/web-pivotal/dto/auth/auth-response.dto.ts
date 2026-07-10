// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export class AuthUserDto {

    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly role: string,
        public readonly fspId: string | null,
    ) {
    }
}

export class LoginResponseDto {

    constructor(
        public readonly accessToken: string,
        public readonly accessTokenExpiresIn: number,
        public readonly user: AuthUserDto,
        public readonly permissions: string[],
        public readonly mustChangePassword: boolean,
    ) {
    }
}

export class RefreshResponseDto {

    constructor(
        public readonly accessToken: string,
        public readonly accessTokenExpiresIn: number,
        public readonly permissions: string[],
        public readonly mustChangePassword: boolean,
    ) {
    }
}
