import {Body, Controller, Inject, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {UpsertEndpointCommand} from '@core/participant/domain';

export class UpsertEndpointRequest {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
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
    @RequiresPermission(PermissionKey.PARTICIPANT_ENDPOINT_REGISTER)
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
