// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    CentralLedgerAxios,
    CentralLedgerException,
    PARTICIPANT_ENDPOINT_TYPES,
    PostParticipantsNameEndpointsRequest,
} from '@shared/central-ledger';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantRepository} from '../repository';
import {UpsertEndpointCommand} from './upsert-endpoint.command';

@CommandHandler(UpsertEndpointCommand)
export class UpsertEndpointHandler
    implements ICommandHandler<UpsertEndpointCommand, UpsertEndpointCommand.Output> {

    private readonly logger = new Logger(UpsertEndpointHandler.name);

    private static toParticipantNotFoundError(name: string): PivotalException {
        return new PivotalException('PARTICIPANT_NOT_FOUND', `Participant not found for name: ${name}`);
    }

    private static rethrowAsPivotalException(error: unknown): void {
        if (error instanceof PivotalException) {
            throw error;
        }

        if (error instanceof CentralLedgerException) {
            throw new PivotalException(error.code, error.description);
        }
    }

    private static buildEndpointValue(baseEndpoint: string, path?: string): string {
        const normalizedBaseEndpoint = baseEndpoint.endsWith('/')
            ? baseEndpoint.slice(0, -1)
            : baseEndpoint;

        if (path == null || path.length === 0) {
            return normalizedBaseEndpoint;
        }

        return `${normalizedBaseEndpoint}${path}`;
    }

    constructor(
        @Inject(CentralLedgerAxios)
        private readonly centralLedgerAxios: CentralLedgerAxios,
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: UpsertEndpointCommand): Promise<UpsertEndpointCommand.Output> {
        const participant = await this.repository.findByName(command.input.name, DbTarget.Write);

        if (participant == null) {
            throw UpsertEndpointHandler.toParticipantNotFoundError(command.input.name);
        }

        try {
            for (const definition of PARTICIPANT_ENDPOINT_TYPES) {
                const request = new PostParticipantsNameEndpointsRequest();
                request.type = definition.type;
                request.value = UpsertEndpointHandler.buildEndpointValue(command.input.endpoint, definition.path);

                await this.centralLedgerAxios.upsertParticipantEndpoints(command.input.name, request);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : undefined;

            this.logger.error(`upsertParticipantEndpoints failed for participant=${command.input.name}`, stack ?? message);
            UpsertEndpointHandler.rethrowAsPivotalException(error);

            throw error;
        }

        return new UpsertEndpointCommand.Output(participant.id);
    }
}
