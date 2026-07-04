// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Menu} from '../model';

export class CreateMenuCommand {

    constructor(public readonly input: CreateMenuCommand.Input) {
    }
}

export namespace CreateMenuCommand {

    export class Input {
        constructor(
            public readonly menuKey:    string,
            public readonly groupLabel: string,
            public readonly label:      string,
            public readonly route:      string,
            public readonly icon?:      string | null,
            public readonly sortOrder?: number,
            public readonly parentId?:  string | null,
        ) {
        }
    }

    export class Output {
        constructor(public readonly menu: Menu) {
        }
    }
}
