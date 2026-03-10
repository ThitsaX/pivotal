import {Logger} from '@nestjs/common';
import {FspClient} from '@core/connector/domain';
import {
    PartiesTypeIDPutResponse,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

export class Wallet2FspClient extends FspClient {

    private readonly logger = new Logger(Wallet2FspClient.name);

    async getParties(input: FspClient.GetPartiesInput): Promise<PartiesTypeIDPutResponse> {
        this.logger.log(`getParties: partyIdType=${input.partyIdType}, partyId=${input.partyId}`);
        // TODO: implement wallet2 party lookup
        throw new Error('Wallet2FspClient.getParties: not implemented');
    }

    async postQuotes(body: QuotesPostRequest): Promise<QuotesIDPutResponse> {
        this.logger.log(`postQuotes: quoteId=${body.quoteId}`);
        // TODO: implement wallet2 quote processing
        throw new Error('Wallet2FspClient.postQuotes: not implemented');
    }

    async postTransfers(body: TransfersPostRequest): Promise<TransfersIDPutResponse> {
        this.logger.log(`postTransfers: transferId=${body.transferId}`);
        // TODO: implement wallet2 transfer processing
        throw new Error('Wallet2FspClient.postTransfers: not implemented');
    }

    async patchTransfers(input: FspClient.PatchTransfersInput): Promise<void> {
        const {transferId, response} = input;
        const fulfilment = response.transferState;

        this.logger.log(`patchTransfers: transferId=${transferId}, transferState=${fulfilment}`);
        // TODO: implement wallet2 transfer patch processing
        throw new Error('Wallet2FspClient.patchTransfers: not implemented');
    }
}
