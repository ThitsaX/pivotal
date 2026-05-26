import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {DbTarget} from '@shared/typeorm';
import {Participant} from '../model';
import {ParticipantRepository} from '../repository';
import {OnboardFspCommand} from './onboard-fsp.command';

@CommandHandler(OnboardFspCommand)
export class OnboardFspHandler
    implements ICommandHandler<OnboardFspCommand, OnboardFspCommand.Output> {

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: OnboardFspCommand): Promise<OnboardFspCommand.Output> {
        const {name, currencies, endpoint, jwsPublicKey, jwsPrivateKey, accessPublicKey} = command.input;

        await this.centralLedgerFacade.onboardFsp(name, currencies, endpoint);

        const existing = await this.repository.findByName(name, DbTarget.Write);
        const entity = new Participant(
            name,
            jwsPublicKey,
            jwsPrivateKey,
            accessPublicKey,
            existing?.id,
        );

        const saved = await this.repository.save(entity);

        return new OnboardFspCommand.Output(saved.id);
    }
}
