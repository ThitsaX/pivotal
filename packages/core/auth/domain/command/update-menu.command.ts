// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Menu} from '../model';

export class UpdateMenuCommand {

    constructor(public readonly input: UpdateMenuCommand.Input) {
    }
}

export namespace UpdateMenuCommand {

    export class Input {
        constructor(
            public readonly menuId:      string,
            public readonly groupLabel?: string,
            public readonly label?:      string,
            public readonly route?:      string,
            public readonly icon?:       string | null,
            public readonly sortOrder?:  number,
            public readonly parentId?:   string | null,
            public readonly isActive?:   boolean,
        ) {
        }
    }

    export class Output {
        constructor(public readonly menu: Menu) {
        }
    }
}
