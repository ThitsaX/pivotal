export class MenuItemDto {

    constructor(
        public readonly key: string,
        public readonly label: string,
        public readonly route: string,
        public readonly icon: string | null,
        public readonly sortOrder: number,
    ) {
    }
}

export class MenuGroupDto {

    constructor(
        public readonly label: string,
        public readonly menus: MenuItemDto[],
    ) {
    }
}

export class MenuResponseDto {

    constructor(public readonly groups: MenuGroupDto[]) {
    }
}
