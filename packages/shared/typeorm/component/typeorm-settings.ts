// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export class TypeOrmSettings {

    constructor(
        readonly host: string,
        readonly port: number,
        readonly username: string,
        readonly password: string,
        readonly database: string,
    ) {}
}
