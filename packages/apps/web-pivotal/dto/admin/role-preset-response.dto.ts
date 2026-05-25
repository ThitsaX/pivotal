import {RoleScope} from '@core/auth/domain';

export class RolePresetResponseDto {

    constructor(
        public readonly key:            string,
        public readonly label:          string,
        public readonly description:    string,
        public readonly scope:          RoleScope,
        public readonly permissionKeys: string[],
    ) {
    }
}
