export class TypeOrmSettings {

    constructor(
        readonly host: string,
        readonly port: number,
        readonly username: string,
        readonly password: string,
        readonly database: string,
        readonly schema: string,
    ) {}
}
