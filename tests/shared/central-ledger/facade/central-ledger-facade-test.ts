import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {CentralLedgerFacade} from '../../../../packages/shared/central-ledger/facade/central-ledger-facade';
import {Currency} from '../../../../packages/shared/fspiop/dto/currency';

describe('CentralLedgerFacade', () => {

    it('should list available enums via central ledger axios', async () => {
        const expectedResponse = {ledgerAccountTypes: ['POSITION']};
        const centralLedgerAxios = {
            async getEnums(): Promise<unknown> {
                return expectedResponse;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        const actualResponse = await facade.listAvailableEnums();

        assert.equal(actualResponse, expectedResponse);
    });

    it('should create the Hub multilateral settlement account', async () => {
        let capturedName: string | undefined;
        let capturedBody: {currency?: Currency; type?: string} | undefined;
        const centralLedgerAxios = {
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                capturedName = name;
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createHubMultilateralSettlementAccount(Currency.Usd);

        assert.equal(capturedName, 'Hub');
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.type, 'HUB_MULTILATERAL_SETTLEMENT');
    });

    it('should create the Hub reconciliation account', async () => {
        let capturedName: string | undefined;
        let capturedBody: {currency?: Currency; type?: string} | undefined;
        const centralLedgerAxios = {
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                capturedName = name;
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createHubReconciliationAccount(Currency.Usd);

        assert.equal(capturedName, 'Hub');
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.type, 'HUB_RECONCILIATION');
    });

    it('should create the deferred net settlement model for the given currency', async () => {
        let capturedBody:
            | {
                name?: string;
                settlementGranularity?: string;
                settlementInterchange?: string;
                settlementDelay?: string;
                requireLiquidityCheck?: boolean;
                ledgerAccountType?: string;
                autoPositionReset?: boolean;
                currency?: Currency;
                settlementAccountType?: string;
            }
            | undefined;
        const centralLedgerAxios = {
            async createSettlementModel(body: typeof capturedBody): Promise<void> {
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createDeferredNetSettlementModel(Currency.Usd);

        assert.equal(capturedBody?.name, 'DEFERREDNETUSD');
        assert.equal(capturedBody?.settlementGranularity, 'NET');
        assert.equal(capturedBody?.settlementInterchange, 'MULTILATERAL');
        assert.equal(capturedBody?.settlementDelay, 'DEFERRED');
        assert.equal(capturedBody?.requireLiquidityCheck, true);
        assert.equal(capturedBody?.ledgerAccountType, 'POSITION');
        assert.equal(capturedBody?.autoPositionReset, true);
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.settlementAccountType, 'SETTLEMENT');
    });

    it('should add the Hub currency for the given currency', async () => {
        const calls: string[] = [];
        const centralLedgerAxios = {
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                calls.push(`${name}:${body.type}:${body.currency}`);
            },
            async createSettlementModel(body: {name?: string; currency?: Currency}): Promise<void> {
                calls.push(`${body.name}:${body.currency}`);
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.addHubCurrency(Currency.Usd);

        assert.deepEqual(calls, [
            'Hub:HUB_MULTILATERAL_SETTLEMENT:USD',
            'Hub:HUB_RECONCILIATION:USD',
            'DEFERREDNETUSD:USD',
        ]);
    });

    it('should list all participants via central ledger axios', async () => {
        const expectedParticipants = [
            {name: 'Hub'},
            {name: 'wallet1'},
        ];
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string}>> {
                return expectedParticipants;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        const actualParticipants = await facade.listAllParticipants();

        assert.equal(actualParticipants, expectedParticipants);
    });
});
