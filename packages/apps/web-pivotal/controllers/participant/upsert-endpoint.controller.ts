import {Body, Controller, Inject, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {UpsertEndpointCommand} from '@core/participant/domain';

export class UpsertEndpointRequest {

    name!: string;

    endpoint!: string;
}

@Controller('participant')
export class UpsertEndpointController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Put('endpoint')
    async upsertEndpoint(
        @Body() request: UpsertEndpointRequest,
    ): Promise<UpsertEndpointCommand.Output> {
        return this.commandBus.execute(
            new UpsertEndpointCommand(
                new UpsertEndpointCommand.Input(
                    request.name,
                    request.endpoint,
                ),
            ),
        );
    }
}
