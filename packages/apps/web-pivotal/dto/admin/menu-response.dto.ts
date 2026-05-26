export class MenuResponseDto {

    constructor(
        public readonly id:              string,
        public readonly menuKey:         string,
        public readonly parentId:        string | null,
        public readonly groupLabel:      string,
        public readonly label:           string,
        public readonly route:           string,
        public readonly icon:            string | null,
        public readonly sortOrder:       number,
        public readonly isActive:        boolean,
        public readonly permissionCount: number,
    ) {
    }
}

export class MenuPermissionsResponseDto {

    constructor(
        public readonly permissionKeys: string[],
    ) {
    }
}
