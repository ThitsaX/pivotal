// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OracleCentralRegistryClient } from '../component';
import { RegisterMsisdnCommand } from './register-msisdn.command';

@CommandHandler(RegisterMsisdnCommand)
export class RegisterMsisdnHandler
    implements ICommandHandler<RegisterMsisdnCommand, RegisterMsisdnCommand.Output> {

    private readonly logger = new Logger(RegisterMsisdnHandler.name);

    constructor(
        @Inject(OracleCentralRegistryClient)
        private readonly oracleCentralRegistryClient: OracleCentralRegistryClient,
    ) {
    }

    async execute(command: RegisterMsisdnCommand): Promise<RegisterMsisdnCommand.Output> {
        this.logger.log('Forwarding Register MSISDN request to Oracle Central Registry.');

        const result = await this.oracleCentralRegistryClient.registerMsisdn(
            command.input.source,
            command.input.request,
        );

        return new RegisterMsisdnCommand.Output(
            result.httpStatus,
            result.body,
        );
    }
}
