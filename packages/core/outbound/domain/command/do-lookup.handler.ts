import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {DoLookupCommand} from './do-lookup.command';

@CommandHandler(DoLookupCommand)
export class DoLookupHandler
    implements ICommandHandler<DoLookupCommand, DoLookupCommand.Output> {

    async execute(command: DoLookupCommand): Promise<DoLookupCommand.Output> {

        const response: PartiesTypeIDPutResponse = {
            party: {
                partyIdInfo: {
                    partyIdType: PartyIdType.Msisdn,
                    partyIdentifier: '123456789',
                    fspId: 'dummy-fsp',
                },
                name: 'Dummy Party',
            },
        };

        return new DoLookupCommand.Output(response);
    }
}
