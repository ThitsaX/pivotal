import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopAxios, FspiopAxiosError, FspiopErrors, FspiopException, FspiopHeaders} from '@shared/fspiop';
import {DoLookupCommand} from './do-lookup.command';
import {PartiesResponseSubscriber} from '../subscriber';

@CommandHandler(DoLookupCommand)
export class DoLookupHandler
    implements ICommandHandler<DoLookupCommand, DoLookupCommand.Output> {

    constructor(
        private readonly fspiopAxios: FspiopAxios,
        private readonly partiesResponseSubscriber: PartiesResponseSubscriber,
    ) {
    }

    async execute(command: DoLookupCommand): Promise<DoLookupCommand.Output> {
        const {correlationId, source, destination, type, id, subId} = command.input;
        const {switchBaseUrl, switchId} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Parties.forRequest(source, switchId);

        // ── Step 1: Subscribe to NATS BEFORE sending the request ─────────────
        // nc.subscribe() is synchronous — the subscription is active immediately.
        // Even if the switch responds before we reach Step 3, NATS buffers the
        // message for the active subscription, eliminating the race condition.
        const waitPromise = this.partiesResponseSubscriber.waitFor(correlationId);

        // ── Step 2: Fire the GET /parties request ─────────────────────────────
        try {
            await this.fspiopAxios
                .withHeaders(headers)
                .getParties(switchBaseUrl, type, id, subId);
        } catch (error) {
            // Cancel the NATS subscription immediately — no callback will arrive.
            this.partiesResponseSubscriber.cancel(correlationId);

            if (FspiopAxiosError.is(error)) {
                const info = error.errorInformationResponse?.errorInformation;
                const code = info?.errorCode ?? '';
                const desc = info?.errorDescription ?? 'Communication error';
                const extensionList = info?.extensionList;
                const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;
                throw new FspiopException(errorDef, desc, extensionList);
            }

            throw error;
        }

        // ── Step 3: Await the callback (parties:<id> or parties-error:<id>) ───
        const response = await waitPromise;

        return new DoLookupCommand.Output(response);
    }
}
