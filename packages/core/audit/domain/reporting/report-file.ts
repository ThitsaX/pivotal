export class ReportFile {
    constructor(
        public readonly bytes: Buffer,
        public readonly extension: string,
        public readonly contentType: string,
    ) {
    }
}
