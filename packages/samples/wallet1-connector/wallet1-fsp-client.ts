import {Logger} from '@nestjs/common';
import {FspClient} from '@core/connector/domain';
import {
    PartiesTypeIDPutResponse,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

export class Wallet1FspClient extends FspClient {

    private readonly logger = new Logger(Wallet1FspClient.name);

    async getParties(input: FspClient.GetPartiesInput): Promise<PartiesTypeIDPutResponse> {
        this.logger.log(`getParties: partyIdType=${input.partyIdType}, partyId=${input.partyId}`);
        // TODO: implement wallet1 party lookup
        throw new Error('Wallet1FspClient.getParties: not implemented');
    }

    async postQuotes(body: QuotesPostRequest): Promise<QuotesIDPutResponse> {
        this.logger.log(`postQuotes: quoteId=${body.quoteId}`);
        // TODO: implement wallet1 quote processing
        throw new Error('Wallet1FspClient.postQuotes: not implemented');
    }

    async postTransfers(body: TransfersPostRequest): Promise<TransfersIDPutResponse> {
        this.logger.log(`postTransfers: transferId=${body.transferId}`);
        // TODO: implement wallet1 transfer processing
        throw new Error('Wallet1FspClient.postTransfers: not implemented');
    }

    async patchTransfers(input: FspClient.PatchTransfersInput): Promise<void> {
        const {transferId, response} = input;
        const fulfilment = response.transferState;

        this.logger.log(`patchTransfers: transferId=${transferId}, transferState=${fulfilment}`);
        // TODO: implement wallet1 transfer patch processing
        throw new Error('Wallet1FspClient.patchTransfers: not implemented');
    }
}
