import {Module} from '@nestjs/common';
import {NatsClientService} from './component';

@Module({
    providers: [NatsClientService],
    exports: [NatsClientService],
})
export class NatsModule {}
