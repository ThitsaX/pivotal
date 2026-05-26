import {PermissionScope} from '@core/auth/domain';

export class PermissionResponseDto {

    constructor(
        public readonly id:          string,
        public readonly keyName:     string,
        public readonly description: string | null,
        public readonly scope:       PermissionScope,
    ) {
    }
}

export class PermissionListResponseDto {

    constructor(
        public readonly items: PermissionResponseDto[],
    ) {
    }
}
