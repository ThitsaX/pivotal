// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Body, Controller, Headers, Inject, Post, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterMsisdnCommand, RegisterMsisdnRequest } from '@core/outbound/domain';
import { FspiopHeaders } from '@shared/fspiop';
import { Response } from 'express';

@Controller('/secured')
export class CentralRegistryController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('/registry/msisdn')
    async registerMsisdn(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE)
        source: string,
        @Body()
        request: RegisterMsisdnRequest,
        @Res({ passthrough: true })
        response: Response,
    ): Promise<unknown> {
        const output: RegisterMsisdnCommand.Output = await this.commandBus.execute(
            new RegisterMsisdnCommand(
                new RegisterMsisdnCommand.Input(source, request),
            ),
        );

        response.status(output.httpStatus);

        return output.body;
    }
}
