export class PermissionResponseDto {

    constructor(
        public readonly id:          string,
        public readonly keyName:     string,
        public readonly description: string | null,
    ) {
    }
}

export class PermissionListResponseDto {

    constructor(
        public readonly items: PermissionResponseDto[],
    ) {
    }
}
