import {Module} from '@nestjs/common';
import {FlywayMigration} from './component';

@Module({
    imports: [],
    providers: [FlywayMigration],
    exports: [FlywayMigration],
})
export class FlywayModule {}
