// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {Participant} from '../model';
import {ParticipantRepository} from '../repository';
import {AddSigningKeysCommand} from './add-signing-keys.command';

@CommandHandler(AddSigningKeysCommand)
export class AddSigningKeysHandler
    implements ICommandHandler<AddSigningKeysCommand, AddSigningKeysCommand.Output> {

    private static readonly EMPTY_ACCESS_PUBLIC_KEY = '';

    constructor(
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: AddSigningKeysCommand): Promise<AddSigningKeysCommand.Output> {
        const existing = await this.repository.findByName(command.input.name, DbTarget.Write);
        const entity = new Participant(
            command.input.name,
            command.input.jwsPublicKey,
            command.input.jwsPrivateKey,
            existing?.accessPublicKey ?? AddSigningKeysHandler.EMPTY_ACCESS_PUBLIC_KEY,
            existing?.id,
        );
        const saved = await this.repository.save(entity);

        return new AddSigningKeysCommand.Output(saved.id);
    }
}
