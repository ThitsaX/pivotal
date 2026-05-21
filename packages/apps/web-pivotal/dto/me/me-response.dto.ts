export class MeUserDto {

    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly role: string,
        public readonly fspId: string | null,
    ) {
    }
}

export class MeResponseDto {

    constructor(
        public readonly user: MeUserDto,
        public readonly permissions: string[],
        public readonly mustChangePassword: boolean,
    ) {
    }
}
