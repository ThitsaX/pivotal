export class UserResponseDto {

    constructor(
        public readonly id:                 string,
        public readonly email:              string,
        public readonly role:               UserRoleSummaryDto,
        public readonly fspId:              string | null,
        public readonly isActive:           boolean,
        public readonly mustChangePassword: boolean,
        public readonly lastLoginAt:        Date | null,
        public readonly createdAt:          Date,
    ) {
    }
}

export class UserRoleSummaryDto {

    constructor(
        public readonly id:   string,
        public readonly code: string,
        public readonly name: string,
    ) {
    }
}

export class UserListResponseDto {

    constructor(
        public readonly items:    UserResponseDto[],
        public readonly page:     number,
        public readonly pageSize: number,
        public readonly total:    number,
    ) {
    }
}

export class UserWithTempPasswordResponseDto {

    constructor(
        public readonly user:         UserResponseDto,
        public readonly tempPassword: string,
    ) {
    }
}
